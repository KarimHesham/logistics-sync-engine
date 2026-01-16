import express from "express";
import { randomUUID } from "crypto";

const app = express();
const port = process.env.MOCK_SHOPIFY_PORT || 4001;

app.use(express.json());

// Leaky Bucket State
// Shopify standard: 40 requests bucket, leak 2/sec.
// To make it easier to hit 429, we'll use a smaller bucket for this mock.
const BUCKET_CAPACITY = 4; // Small capacity to easily hit limit
const LEAK_RATE = 2; // leaks 2 requests per second
let currentBucket = 0;
let lastLeakTime = Date.now();

const API_WEBHOOK_URL =
  process.env.API_WEBHOOK_URL || "http://localhost:4000/ingest/webhook/shopify";

function updateBucket() {
  const now = Date.now();
  const result = (now - lastLeakTime) / 1000;
  const leakAmount = result * LEAK_RATE;
  currentBucket = Math.max(0, currentBucket - leakAmount);
  lastLeakTime = now;
}

app.post("/admin/orders/:orderId", (req, res) => {
  updateBucket();

  if (currentBucket >= BUCKET_CAPACITY) {
    res.setHeader("Retry-After", "1");
    // @ts-ignore
    return res.status(429).json({
      errors:
        "Exceeded 2 calls per second for api client. Reduce request rates to resume uninterrupted service.",
    });
  }

  currentBucket++;

  const { orderId } = req.params;

  // Dummy Order Data
  const order = {
    id: +orderId || Math.floor(Math.random() * 100000),
    email: "mock@example.com",
    created_at: new Date().toISOString(),
    total_price: "100.00",
    currency: "USD",
    financial_status: "paid",
    line_items: [
      {
        id: randomUUID(),
        title: "Mock Item",
        quantity: 1,
        price: "100.00",
      },
    ],
  };

  // Optionally emit webhook (10% chance)
  if (Math.random() < 0.1) {
    console.log(`[MockShopify] trigger random webhook for order ${orderId}`);
    // Fire and forget
    fetch(API_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Topic": "orders/updated",
        "X-Shopify-Hmac-Sha256": "mock-sig",
      },
      body: JSON.stringify(order),
    }).catch((e) => console.error("Webhook trigger failed", e));
  }

  res.json({ order });
});

app.post("/simulate/webhook", async (req, res) => {
  const { orderId, events, shuffle } = req.body;

  if (!events || !Array.isArray(events)) {
    // @ts-ignore
    return res.status(400).json({ error: "events array required" });
  }

  let finalEvents = [...events];

  // Handle Duplicates
  finalEvents = finalEvents.flatMap((evt) => {
    const copies = [evt];
    if (evt.duplicateCount && evt.duplicateCount > 0) {
      for (let i = 0; i < evt.duplicateCount; i++) {
        copies.push({ ...evt, _isDuplicate: true });
      }
    }
    return copies;
  });

  // Handle Shuffle
  if (shuffle) {
    for (let i = finalEvents.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [finalEvents[i], finalEvents[j]] = [finalEvents[j], finalEvents[i]];
    }
  }

  console.log(
    `[MockShopify] Simulating ${finalEvents.length} webhook events for order ${orderId}`
  );

  // Send events
  const results = [];
  for (const evt of finalEvents) {
    // Construct payload matching Shopify structure if needed, or use payload from event
    // The user said: { eventType, eventTs, payload }

    // We assume the target API expects a Shopify webhook body.
    // If 'payload' is present in event, use it. Otherwise construct minimal.
    const hookBody = evt.payload || {
      id: orderId,
      updated_at: evt.eventTs || new Date().toISOString(),
    };
    const topic = evt.eventType || "orders/updated";

    try {
      const resp = await fetch(API_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Topic": topic,
          "X-Shopify-Hmac-Sha256": "mock-sig-simulated",
        },
        body: JSON.stringify(hookBody),
      });
      results.push({ success: resp.ok, status: resp.status });
    } catch (e: any) {
      results.push({ success: false, error: e.message });
    }
  }

  res.json({
    message: "Simulation complete",
    sentCount: finalEvents.length,
    results,
  });
});

app.listen(port, () => {
  console.log(`Mock Shopify listening on port ${port}`);
});
