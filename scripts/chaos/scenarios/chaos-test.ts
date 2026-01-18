// ============================================================================
// Chaos Test Scenario
// Sends 100 simultaneous conflicting updates to a single order
// Validates that lastEventTs reflects the maximum timestamp among all events
// ============================================================================

import axios from "axios";
import { Client } from "pg";
import type { ChaosTestResult, TestConfig, EventInboxStats } from "../types";

const NUM_EVENTS = 100;
const DEFAULT_CONCURRENCY = 20; // Max concurrent requests

const STATUSES = ["SHIPPED", "DELIVERED", "RETURNED", "LOST"] as const;
const CITIES = ["New York", "London", "Paris", "Tokyo", "Cairo"] as const;

// Simple concurrency limiter to prevent overwhelming the database
async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const p = task().then((result) => {
      results.push(result);
    });

    const e: Promise<void> = p.then(() => {
      executing.splice(executing.indexOf(e), 1);
    });
    executing.push(e);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// Retry wrapper for transient failures (5xx errors)
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 500
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Only retry on 5xx errors or network errors
      const is5xx = lastError.message.includes("status code 5");
      const isNetwork =
        lastError.message.includes("ECONNREFUSED") ||
        lastError.message.includes("ETIMEDOUT");

      if ((is5xx || isNetwork) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError;
}

function randomStatus(): string {
  return STATUSES[Math.floor(Math.random() * STATUSES.length)];
}

function randomCity(): string {
  return CITIES[Math.floor(Math.random() * CITIES.length)];
}

export interface ChaosTestOptions {
  orderId?: string;
  numEvents?: number;
  waitTimeMs?: number;
  concurrencyLimit?: number;
  /** When true, fires all events simultaneously using Promise.all() (default: true) */
  simultaneous?: boolean;
}

export async function runChaosTest(
  config: TestConfig,
  options: ChaosTestOptions = {}
): Promise<ChaosTestResult> {
  const orderId = options.orderId || `chaos-${Date.now()}`;
  const numEvents = options.numEvents || NUM_EVENTS;
  const waitTimeMs = options.waitTimeMs || 8000;
  const concurrencyLimit = options.concurrencyLimit || DEFAULT_CONCURRENCY;
  const simultaneous = options.simultaneous ?? true; // Default to true for chaos test

  const startTime = new Date();
  const errors: string[] = [];
  const warnings: string[] = [];

  const client = new Client({ connectionString: config.databaseUrl });

  let shopifyEventCount = 0;
  let courierEventCount = 0;
  let duplicateCount = 0;
  let maxTs = 0;
  let inboxItemsProcessed = 0;
  let actualLastEventTs = "";
  let timestampMatchValid = false;
  let shipmentExists = false;

  try {
    await client.connect();

    // Ensure queues exist
    try {
      await client.query("SELECT pgmq.create('ingest_events')");
      await client.query("SELECT pgmq.create('shopify_outbound')");
    } catch {
      // Ignore if already exists
    }

    // 1. Create base order
    const baseDate = new Date();
    maxTs = baseDate.getTime();

    await withRetry(() =>
      axios.post(
        `${config.apiUrl}/webhooks/shopify/orders`,
        {
          id: orderId,
          created_at: baseDate.toISOString(),
          updated_at: baseDate.toISOString(),
          customer: { id: "cust_chaos_123" },
          shipping_address: {
            address1: "123 Base St",
            city: "Base City",
            province: "NY",
            zip: "10001",
            country: "US",
          },
          financial_status: "paid",
        },
        {
          headers: {
            "x-shopify-topic": "SHOPIFY_CREATED",
            "x-shopify-webhook-id": `base-${orderId}`,
          },
        }
      )
    );

    // 2. Generate chaos events
    const events: Array<() => Promise<unknown>> = [];

    for (let i = 0; i < numEvents; i++) {
      const isShopify = Math.random() > 0.5;
      // Random time offset: -1 min to +5 min from base
      const offset = Math.floor(Math.random() * 360000) - 60000;
      const ts = new Date(baseDate.getTime() + offset);
      const tsStr = ts.toISOString();

      if (ts.getTime() > maxTs) {
        maxTs = ts.getTime();
      }

      if (isShopify) {
        shopifyEventCount++;
        const city = randomCity();
        // 10% chance of duplicate webhook ID
        const isDuplicate = Math.random() < 0.1;
        if (isDuplicate) duplicateCount++;

        events.push(() =>
          withRetry(() =>
            axios.post(
              `${config.apiUrl}/webhooks/shopify/orders`,
              {
                id: orderId,
                updated_at: tsStr,
                shipping_address: {
                  address1: "Updated St",
                  city: city,
                  province: "CA",
                  zip: "90210",
                  country: "US",
                },
              },
              {
                headers: {
                  "x-shopify-topic": "SHOPIFY_UPDATED",
                  "x-shopify-webhook-id": isDuplicate
                    ? `dup-${i % 10}`
                    : `evt-${i}`,
                },
              }
            )
          ).catch((err) => {
            if (err.response?.status !== 400) {
              errors.push(`Shopify event ${i} failed: ${err.message}`);
            }
          })
        );
      } else {
        courierEventCount++;
        const status = randomStatus();

        events.push(() =>
          withRetry(() =>
            axios.post(`${config.apiUrl}/events/courier/status_update`, {
              orderId: orderId,
              eventType: "COURIER_STATUS_UPDATE",
              eventTs: tsStr,
              trackingNumber: "TRACK123",
              status: status,
            })
          ).catch((err) => {
            errors.push(`Courier event ${i} failed: ${err.message}`);
          })
        );
      }
    }

    // 3. Shuffle and fire events
    events.sort(() => Math.random() - 0.5);

    if (simultaneous) {
      // Fire ALL events simultaneously (true chaos test as per requirements)
      console.log(
        `[Chaos Test] Firing ${events.length} events SIMULTANEOUSLY...`
      );
      await Promise.all(events.map((fn) => fn()));
    } else {
      // Use concurrency limiting (for debugging/development)
      console.log(
        `[Chaos Test] Firing ${events.length} events with concurrency limit ${concurrencyLimit}...`
      );
      await runWithConcurrencyLimit(events, concurrencyLimit);
    }

    // 4. Wait for processing
    await new Promise((r) => setTimeout(r, waitTimeMs));

    // 5. Verify results
    const orderRes = await axios.get(`${config.apiUrl}/orders/${orderId}`);
    const order = orderRes.data;

    // Get inbox stats
    const inboxRes = await client.query<EventInboxStats>(
      `SELECT status, COUNT(*)::int as count FROM event_inbox WHERE order_id = $1 GROUP BY status`,
      [orderId]
    );

    inboxItemsProcessed = inboxRes.rows.reduce(
      (acc, r) => acc + Number(r.count),
      0
    );

    // Validate lastEventTs
    actualLastEventTs = order.lastEventTs;
    const apiLastTs = new Date(order.lastEventTs).getTime();
    timestampMatchValid = Math.abs(apiLastTs - maxTs) <= 1000; // Allow 1s tolerance

    if (!timestampMatchValid) {
      errors.push(
        `LastEventTs mismatch: expected ${new Date(
          maxTs
        ).toISOString()}, got ${actualLastEventTs}`
      );
    }

    // Validate shipment exists
    shipmentExists = order.shipments && order.shipments.length > 0;
    if (!shipmentExists && courierEventCount > 0) {
      errors.push("No shipment found despite courier events being sent");
    }

    // Check for expected total (1 base + numEvents)
    const expectedTotal = numEvents + 1;
    if (inboxItemsProcessed !== expectedTotal) {
      warnings.push(
        `Inbox items ${inboxItemsProcessed} != expected ${expectedTotal}. Some may have been dropped or deduplicated.`
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Chaos test failed: ${errorMsg}`);
  } finally {
    await client.end();
  }

  const endTime = new Date();

  return {
    name: "chaos-test",
    success: errors.length === 0,
    startTime,
    endTime,
    durationMs: endTime.getTime() - startTime.getTime(),
    errors,
    warnings,
    metrics: {
      orderId,
      totalEventsGenerated: numEvents + 1,
      shopifyEvents: shopifyEventCount + 1, // +1 for base order
      courierEvents: courierEventCount,
      duplicatesGenerated: duplicateCount,
      expectedMaxTimestamp: new Date(maxTs).toISOString(),
      actualLastEventTs,
      timestampMatchValid,
      shipmentExists,
      inboxItemsProcessed,
    },
  };
}
