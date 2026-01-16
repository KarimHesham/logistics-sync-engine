// Native fetch used

const BASE_URL = process.env.MOCK_URL || "http://localhost:4001";

async function testRateLimit() {
  console.log("Testing Rate Limit...");
  let hit429 = false;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${BASE_URL}/admin/orders/${i}`, {
      method: "POST",
    });
    console.log(
      `Req ${i}: status ${res.status} ${
        res.headers.get("retry-after")
          ? "Retry-After: " + res.headers.get("retry-after")
          : ""
      }`
    );
    if (res.status === 429) hit429 = true;
  }
  if (hit429) console.log("✅ Rate limit hit (429 received)");
  else console.error("❌ Rate limit NOT hit (check bucket settings)");
}

async function testWebhookSim() {
  console.log("\nTesting Webhook Simulation...");
  const payload = {
    orderId: "123",
    events: [
      {
        eventType: "orders/updated",
        eventTs: new Date().toISOString(),
        duplicateCount: 2,
        payload: { id: 123, status: "test" },
      },
      {
        eventType: "orders/create",
        eventTs: new Date().toISOString(),
        duplicateCount: 0,
        payload: { id: 124, status: "test2" },
      },
    ],
    shuffle: true,
  };

  const res = await fetch(`${BASE_URL}/simulate/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));

  // Total events should be:
  // Event 1: 1 original + 2 duplicates = 3
  // Event 2: 1 original = 1
  // Total 4
  if (data.sentCount === 4) console.log("✅ Duplication logic correct");
  else console.error(`❌ Expected 4 events, sent ${data.sentCount}`);
}

async function main() {
  try {
    // Wait for server to start
    await new Promise((r) => setTimeout(r, 1000));
    await testRateLimit();
    await testWebhookSim();
  } catch (e) {
    console.error(e);
  }
}

main();
