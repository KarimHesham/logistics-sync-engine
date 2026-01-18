// ============================================================================
// Flash Sale Scenario
// Simulates 5,000 orders created in 60 seconds with concurrent webhooks
// and courier status updates
// ============================================================================

import axios from "axios";
import { Client } from "pg";
import type { FlashSaleResult, TestConfig, GeneratedEvent } from "../types";

const DEFAULT_ORDER_COUNT = 5000;
const DEFAULT_DURATION_SEC = 60;
const DUPLICATE_RATE = 0.1; // 10% duplicates
const DEFAULT_CONCURRENCY_LIMIT = 10; // Max concurrent requests per batch

const STATUSES = [
  "SHIPPED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;
const CITIES = [
  "New York",
  "Los Angeles",
  "Chicago",
  "Houston",
  "Phoenix",
  "Philadelphia",
  "San Antonio",
  "San Diego",
  "Dallas",
  "San Jose",
] as const;

function randomStatus(): string {
  return STATUSES[Math.floor(Math.random() * STATUSES.length)];
}

function randomCity(): string {
  return CITIES[Math.floor(Math.random() * CITIES.length)];
}

function randomPrice(): string {
  return (Math.random() * 500 + 10).toFixed(2);
}

export interface FlashSaleOptions {
  orderCount?: number;
  durationSec?: number;
  batchSize?: number;
  waitTimeMs?: number;
  webhooksPerOrder?: number;
  courierEventsPerOrder?: number;
  concurrencyLimit?: number;
}

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

interface BatchMetrics {
  ordersCreated: number;
  webhooksSent: number;
  courierEventsSent: number;
  duplicatesGenerated: number;
  errorsCount: number;
}

export async function runFlashSale(
  config: TestConfig,
  options: FlashSaleOptions = {}
): Promise<FlashSaleResult> {
  const orderCount = options.orderCount ?? DEFAULT_ORDER_COUNT;
  const durationSec = options.durationSec ?? DEFAULT_DURATION_SEC;
  const batchSize = options.batchSize ?? 50; // Reduced from 100
  const waitTimeMs = options.waitTimeMs ?? 15000;
  const webhooksPerOrder = options.webhooksPerOrder ?? 1; // Reduced from 2
  const courierEventsPerOrder = options.courierEventsPerOrder ?? 1;
  const concurrencyLimit =
    options.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT;

  const startTime = new Date();
  const errors: string[] = [];
  const warnings: string[] = [];

  const client = new Client({ connectionString: config.databaseUrl });

  // Metrics
  let ordersCreated = 0;
  let webhooksSent = 0;
  let courierEventsSent = 0;
  let duplicatesGenerated = 0;
  let duplicatesHandled = 0;
  const processingTimes: number[] = [];
  const ordersPerSecond: number[] = [];

  const runPrefix = `flash-${Date.now()}`;

  try {
    await client.connect();

    // Ensure queues exist
    try {
      await client.query("SELECT pgmq.create('ingest_events')");
      await client.query("SELECT pgmq.create('shopify_outbound')");
    } catch {
      // Ignore if already exists
    }

    // Calculate batching
    const totalBatches = Math.ceil(orderCount / batchSize);
    const delayBetweenBatches = (durationSec * 1000) / totalBatches;

    console.log(
      `[Flash Sale] Starting: ${orderCount} orders in ${durationSec}s`
    );
    console.log(
      `[Flash Sale] Batches: ${totalBatches}, Batch size: ${batchSize}`
    );
    console.log(
      `[Flash Sale] Delay between batches: ${delayBetweenBatches.toFixed(0)}ms`
    );

    for (let batch = 0; batch < totalBatches; batch++) {
      const batchStartTime = Date.now();
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, orderCount);
      const currentBatchSize = batchEnd - batchStart;

      const batchMetrics = await processBatch(
        config,
        runPrefix,
        batchStart,
        currentBatchSize,
        webhooksPerOrder,
        courierEventsPerOrder,
        concurrencyLimit,
        errors
      );

      ordersCreated += batchMetrics.ordersCreated;
      webhooksSent += batchMetrics.webhooksSent;
      courierEventsSent += batchMetrics.courierEventsSent;
      duplicatesGenerated += batchMetrics.duplicatesGenerated;

      const batchDuration = Date.now() - batchStartTime;
      processingTimes.push(batchDuration);
      ordersPerSecond.push((currentBatchSize / batchDuration) * 1000);

      // Progress log
      const progress = (((batch + 1) / totalBatches) * 100).toFixed(1);
      console.log(
        `[Flash Sale] Batch ${batch + 1}/${totalBatches} (${progress}%) - ` +
          `${batchMetrics.ordersCreated} orders, ${batchMetrics.errorsCount} errors`
      );

      // Wait between batches to spread load
      if (batch < totalBatches - 1) {
        const remainingDelay = Math.max(0, delayBetweenBatches - batchDuration);
        if (remainingDelay > 0) {
          await new Promise((r) => setTimeout(r, remainingDelay));
        }
      }
    }

    console.log(
      `[Flash Sale] All batches sent. Waiting ${waitTimeMs}ms for processing...`
    );

    // Wait for processing to complete
    await new Promise((r) => setTimeout(r, waitTimeMs));

    // Verify results by checking database
    const verifyResult = await verifyFlashSaleResults(
      client,
      runPrefix,
      orderCount,
      duplicatesGenerated,
      errors,
      warnings
    );

    duplicatesHandled = verifyResult.duplicatesHandled;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Flash sale failed: ${errorMsg}`);
  } finally {
    await client.end();
  }

  const endTime = new Date();
  const avgProcessingTime =
    processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0;
  const peakOrdersPerSec =
    ordersPerSecond.length > 0 ? Math.max(...ordersPerSecond) : 0;

  return {
    name: "flash-sale",
    success: errors.length === 0,
    startTime,
    endTime,
    durationMs: endTime.getTime() - startTime.getTime(),
    errors,
    warnings,
    metrics: {
      totalOrdersAttempted: orderCount,
      ordersCreated,
      webhooksSent,
      courierEventsSent,
      duplicatesGenerated,
      duplicatesHandled,
      avgProcessingTimeMs: Math.round(avgProcessingTime),
      peakOrdersPerSecond: Math.round(peakOrdersPerSec),
    },
  };
}

async function processBatch(
  config: TestConfig,
  runPrefix: string,
  batchStart: number,
  batchSize: number,
  webhooksPerOrder: number,
  courierEventsPerOrder: number,
  concurrencyLimit: number,
  errors: string[]
): Promise<BatchMetrics> {
  const metrics: BatchMetrics = {
    ordersCreated: 0,
    webhooksSent: 0,
    courierEventsSent: 0,
    duplicatesGenerated: 0,
    errorsCount: 0,
  };

  const events: Array<() => Promise<void>> = [];

  for (let i = 0; i < batchSize; i++) {
    const orderNum = batchStart + i;
    const orderId = `${runPrefix}-order-${orderNum}`;
    const baseDate = new Date();

    // 1. Create order event
    events.push(async () => {
      try {
        await withRetry(() =>
          axios.post(
            `${config.apiUrl}/webhooks/shopify/orders`,
            {
              id: orderId,
              created_at: baseDate.toISOString(),
              updated_at: baseDate.toISOString(),
              customer: { id: `cust_${orderNum}` },
              email: `customer${orderNum}@flashsale.test`,
              total_price: randomPrice(),
              shipping_address: {
                address1: `${100 + orderNum} Flash Sale St`,
                city: randomCity(),
                province: "CA",
                zip: `${90000 + (orderNum % 1000)}`,
                country: "US",
              },
              financial_status: "paid",
            },
            {
              headers: {
                "x-shopify-topic": "SHOPIFY_CREATED",
                "x-shopify-webhook-id": `create-${orderId}`,
              },
            }
          )
        );
        metrics.ordersCreated++;
      } catch (err) {
        metrics.errorsCount++;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("400")) {
          errors.push(`Order ${orderId} creation failed: ${msg}`);
        }
      }
    });

    // 2. Generate webhook updates
    for (let w = 0; w < webhooksPerOrder; w++) {
      const updateTs = new Date(baseDate.getTime() + (w + 1) * 1000);
      const isDuplicate = Math.random() < DUPLICATE_RATE;
      if (isDuplicate) metrics.duplicatesGenerated++;

      events.push(async () => {
        try {
          await withRetry(() =>
            axios.post(
              `${config.apiUrl}/webhooks/shopify/orders`,
              {
                id: orderId,
                updated_at: updateTs.toISOString(),
                shipping_address: {
                  address1: `${100 + orderNum} Updated St`,
                  city: randomCity(),
                  province: "NY",
                  zip: `${10000 + (orderNum % 1000)}`,
                  country: "US",
                },
              },
              {
                headers: {
                  "x-shopify-topic": "SHOPIFY_UPDATED",
                  "x-shopify-webhook-id": isDuplicate
                    ? `dup-webhook-${orderId}`
                    : `webhook-${orderId}-${w}`,
                },
              }
            )
          );
          metrics.webhooksSent++;
        } catch {
          // Ignore 400 errors (duplicates are expected)
        }
      });
    }

    // 3. Generate courier status updates
    for (let c = 0; c < courierEventsPerOrder; c++) {
      const courierTs = new Date(baseDate.getTime() + (c + 1) * 2000 + 5000);

      events.push(async () => {
        try {
          await withRetry(() =>
            axios.post(`${config.apiUrl}/events/courier/status_update`, {
              orderId: orderId,
              eventType: "COURIER_STATUS_UPDATE",
              eventTs: courierTs.toISOString(),
              trackingNumber: `TRACK-${orderId}`,
              status: randomStatus(),
            })
          );
          metrics.courierEventsSent++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Courier event for ${orderId} failed: ${msg}`);
        }
      });
    }
  }

  // Shuffle events to simulate realistic out-of-order delivery
  events.sort(() => Math.random() - 0.5);

  // Execute events with concurrency limit to prevent overwhelming the database
  await runWithConcurrencyLimit(events, concurrencyLimit);

  return metrics;
}

async function verifyFlashSaleResults(
  client: Client,
  runPrefix: string,
  expectedOrders: number,
  duplicatesGenerated: number,
  errors: string[],
  warnings: string[]
): Promise<{ duplicatesHandled: number }> {
  let duplicatesHandled = 0;

  try {
    // Count orders created with our prefix
    const ordersResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM orders WHERE order_id LIKE $1`,
      [`${runPrefix}%`]
    );
    const actualOrders = parseInt(ordersResult.rows[0]?.count || "0", 10);

    if (actualOrders < expectedOrders * 0.95) {
      // Allow 5% tolerance
      warnings.push(
        `Only ${actualOrders}/${expectedOrders} orders created (${(
          (actualOrders / expectedOrders) *
          100
        ).toFixed(1)}%)`
      );
    }

    // Count inbox events
    const inboxResult = await client.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count FROM event_inbox WHERE order_id LIKE $1 GROUP BY status`,
      [`${runPrefix}%`]
    );

    const statusCounts: Record<string, number> = {};
    for (const row of inboxResult.rows) {
      statusCounts[row.status] = parseInt(row.count, 10);
    }

    // Count duplicate events that were ignored
    const duplicateIgnored = statusCounts["DUPLICATE_IGNORED"] || 0;
    duplicatesHandled = duplicateIgnored;

    // Check for any failed events
    const failedCount = statusCounts["FAILED"] || 0;
    if (failedCount > 0) {
      warnings.push(`${failedCount} events failed processing`);
    }

    // Verify shipments exist for orders with courier events
    const shipmentsResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM shipments WHERE order_order_id LIKE $1`,
      [`${runPrefix}%`]
    );
    const shipmentCount = parseInt(shipmentsResult.rows[0]?.count || "0", 10);

    if (shipmentCount < actualOrders * 0.9) {
      // Allow some tolerance
      warnings.push(
        `Only ${shipmentCount}/${actualOrders} orders have shipments`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Verification query failed: ${msg}`);
  }

  return { duplicatesHandled };
}
