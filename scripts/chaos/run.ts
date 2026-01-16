import axios from "axios";
import { Client } from "pg";
import * as dotenv from "dotenv";
import path from "node:path";

// Fix for CJS execution context via tsx
const envPath = path.resolve(__dirname, "../../apps/api/.env");
console.log("Loading env from:", envPath);
dotenv.config({ path: envPath });

const API_URL = process.env.API_URL || "http://localhost:4000";
const DB_URL = process.env.SUPABASE_DATABASE_URL;

if (!DB_URL) {
  console.error("Missing SUPABASE_DATABASE_URL");
  process.exit(1);
}

const ORDER_ID = `chaos-${Date.now()}`;
const NUM_EVENTS = 100;

// Random helpers
const randomStatus = () =>
  ["SHIPPED", "DELIVERED", "RETURNED", "LOST"][Math.floor(Math.random() * 4)];
const randomCity = () =>
  ["New York", "London", "Paris", "Tokyo", "Cairo"][
    Math.floor(Math.random() * 5)
  ];

async function main() {
  console.log(`Starting Chaos Run for Order: ${ORDER_ID}`);
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // 0. Ensure queues exist
    try {
      await client.query("SELECT pgmq.create('ingest_events')");
      await client.query("SELECT pgmq.create('shopify_outbound')");
      console.log("Queues created (or already existed).");
    } catch (e: any) {
      // Ignore if exists
      console.log("Queue creation check complete (ignored error if existing).");
    }

    // 1. Base Order (SHOPIFY_CREATED)
    console.log("Creating base order...");
    const baseDate = new Date();
    await axios.post(
      `${API_URL}/webhooks/shopify/orders`,
      {
        id: ORDER_ID,
        created_at: baseDate.toISOString(),
        updated_at: baseDate.toISOString(),
        customer: { id: "cust_123" },
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
          "x-shopify-webhook-id": `base-${ORDER_ID}`,
        },
      }
    );
    console.log("Base order created.");

    // 2. Generate Chaos Events
    const events: Array<() => Promise<any>> = [];
    const timestamps: Date[] = [];

    // We want the final state to be deterministic based on max timestamp
    // So we'll track the "winner" locally to assert later
    let maxTs = baseDate.getTime();

    for (let i = 0; i < NUM_EVENTS; i++) {
      const isShopify = Math.random() > 0.5;
      // Random time offset: -1 min to +5 min from base
      const offset = Math.floor(Math.random() * 360000) - 60000;
      const ts = new Date(baseDate.getTime() + offset);
      const tsStr = ts.toISOString();

      if (ts.getTime() > maxTs) {
        maxTs = ts.getTime();
      }

      timestamps.push(ts); // Track all meant-to-be-sent timestamps

      if (isShopify) {
        const city = randomCity();

        events.push(() =>
          axios
            .post(
              `${API_URL}/webhooks/shopify/orders`,
              {
                id: ORDER_ID,
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
                  "x-shopify-webhook-id":
                    Math.random() < 0.1 ? `dup-${i % 10}` : `evt-${i}`,
                },
              }
            )
            .catch((err) => {
              if (err.response?.status !== 400)
                console.error("Shopify event failed", err.message);
            })
        );
      } else {
        const status = randomStatus();

        events.push(() =>
          axios
            .post(`${API_URL}/events/courier/status_update`, {
              orderId: ORDER_ID,
              eventType: "COURIER_STATUS_UPDATE",
              eventTs: tsStr,
              trackingNumber: "TRACK123",
              status: status,
            })
            .catch((err) => console.error("Courier event failed", err.message))
        );
      }
    }

    // 3. Fire Events
    console.log(`Firing ${NUM_EVENTS} events...`);
    // Shuffle events
    events.sort(() => Math.random() - 0.5);

    // Burst execution
    await Promise.all(events.map((fn) => fn()));
    console.log("Events fired. Waiting for processing...");

    // 4. Wait
    // Give consumer some time to process
    await new Promise((r) => setTimeout(r, 5000));

    // 5. Verify
    console.log("Verifying...");

    // API Check
    const orderRes = await axios.get(`${API_URL}/orders/${ORDER_ID}`);
    const order = orderRes.data;

    // DB Stats Check
    const inboxRes = await client.query(
      `SELECT status, COUNT(*) as count FROM event_inbox WHERE order_id = $1 GROUP BY status`,
      [ORDER_ID]
    );
    console.log("Inbox Stats:", inboxRes.rows);

    // Assertions
    let failed = false;

    // A. Last Event TS
    const apiLastTs = new Date(order.lastEventTs).getTime();
    if (Math.abs(apiLastTs - maxTs) > 1000) {
      // Allow 1s precision diff if any
      if (apiLastTs !== maxTs) {
        console.error(
          `ASSERTION FAILED: LastEventTs mismatch. Expected ${maxTs} (${new Date(
            maxTs
          ).toISOString()}), got ${apiLastTs} (${order.lastEventTs})`
        );
        failed = true;
      }
    } else {
      console.log("PASS: LastEventTs matches max input timestamp.");
    }

    // Check invariants
    const totalProcessed = inboxRes.rows.reduce(
      (acc: number, r: any) => acc + Number.parseInt(r.count),
      0
    );
    // 1 base + 100 chaos = 101 expected
    if (totalProcessed !== NUM_EVENTS + 1) {
      console.warn(
        `WARNING: Total inbox items ${totalProcessed} != expected ${
          NUM_EVENTS + 1
        }. Some might be dropped or failed to insert.`
      );
    }

    if (!order.shipments || order.shipments.length === 0) {
      // If we sent ANY courier event, shipment should exist.
      console.error("ASSERTION FAILED: No shipment found.");
      failed = true;
    } else {
      console.log("PASS: Shipment exists.");
    }

    if (failed) {
      process.exit(1);
    }

    console.log("SUCCESS: All checks passed.");
  } catch (err) {
    console.error("Script failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
