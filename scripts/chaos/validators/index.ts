// ============================================================================
// Database Validation Functions
// Validates consistency checks for idempotency, ordering, atomicity, and queues
// ============================================================================

import { Client } from "pg";
import type {
  ValidationResult,
  ValidationCheck,
  ValidationStatus,
  FlashSaleResult,
  ChaosTestResult,
  QueueStats,
} from "../types";

export interface ValidatorOptions {
  flashSalePrefix?: string;
  chaosOrderId?: string;
  verbose?: boolean;
}

export async function runValidations(
  client: Client,
  flashSaleResult?: FlashSaleResult,
  chaosTestResult?: ChaosTestResult,
  options: ValidatorOptions = {}
): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];

  // 1. Idempotency validation
  checks.push(await validateIdempotency(client, options));

  // 2. Event ordering validation
  if (chaosTestResult) {
    checks.push(validateEventOrdering(chaosTestResult));
  }

  // 3. Atomicity validation (shipment + order consistency)
  checks.push(await validateAtomicity(client, options));

  // 4. Queue drainage validation
  checks.push(await validateQueueDrainage(client));

  // 5. Data integrity validation
  checks.push(await validateDataIntegrity(client, options));

  // 6. Flash sale specific validations
  if (flashSaleResult && options.flashSalePrefix) {
    checks.push(
      await validateFlashSaleConsistency(
        client,
        flashSaleResult,
        options.flashSalePrefix
      )
    );
  }

  // Calculate summary
  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warningCount = checks.filter((c) => c.status === "warning").length;
  const skippedCount = checks.filter((c) => c.status === "skipped").length;

  const overallStatus: ValidationStatus =
    failCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass";

  return {
    checks,
    passCount,
    failCount,
    warningCount,
    skippedCount,
    overallStatus,
  };
}

// ============================================================================
// Individual Validators
// ============================================================================

async function validateIdempotency(
  client: Client,
  options: ValidatorOptions
): Promise<ValidationCheck> {
  const check: ValidationCheck = {
    name: "Idempotency",
    description:
      "Verifies that duplicate webhook IDs result in single event_inbox entries",
    status: "pass",
    details: "",
    data: {},
  };

  try {
    // Check for duplicate dedupe_key entries (should be 0 due to unique constraint)
    const duplicateResult = await client.query<{ dedupe_key: string; count: string }>(`
      SELECT dedupe_key, COUNT(*)::text as count 
      FROM event_inbox 
      GROUP BY dedupe_key 
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    if (duplicateResult.rows.length > 0) {
      check.status = "fail";
      check.details = `Found ${duplicateResult.rows.length} duplicate dedupe_key entries`;
      check.data = { duplicates: duplicateResult.rows };
    } else {
      check.details = "No duplicate dedupe_key entries found - idempotency maintained";
    }

    // Also check for events marked as duplicates that were properly handled
    const handledDuplicates = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text as count 
      FROM event_inbox 
      WHERE status = 'DUPLICATE_IGNORED'
    `);

    check.data = {
      ...check.data,
      duplicatesHandled: parseInt(handledDuplicates.rows[0]?.count || "0", 10),
    };
  } catch (err) {
    check.status = "fail";
    check.details = `Query failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return check;
}

function validateEventOrdering(chaosTestResult: ChaosTestResult): ValidationCheck {
  const check: ValidationCheck = {
    name: "Event Ordering",
    description:
      "Verifies that lastEventTs reflects the maximum timestamp among processed events",
    status: "pass",
    details: "",
    data: {},
  };

  const { expectedMaxTimestamp, actualLastEventTs, timestampMatchValid } =
    chaosTestResult.metrics;

  if (timestampMatchValid) {
    check.details = `Timestamp validation passed: lastEventTs (${actualLastEventTs}) matches expected max (${expectedMaxTimestamp})`;
  } else {
    check.status = "fail";
    check.details = `Timestamp mismatch: expected ${expectedMaxTimestamp}, got ${actualLastEventTs}`;
  }

  check.data = {
    expectedMaxTimestamp,
    actualLastEventTs,
    timestampMatchValid,
  };

  return check;
}

async function validateAtomicity(
  client: Client,
  options: ValidatorOptions
): Promise<ValidationCheck> {
  const check: ValidationCheck = {
    name: "Atomicity",
    description:
      "Verifies that shipment and order updates are atomic (no partial states)",
    status: "pass",
    details: "",
    data: {},
  };

  try {
    // Find orders that have courier events but no shipments (partial state)
    const partialStates = await client.query<{ order_id: string; event_count: string }>(`
      SELECT ei.order_id, COUNT(*)::text as event_count
      FROM event_inbox ei
      WHERE ei.event_type = 'COURIER_STATUS_UPDATE'
        AND ei.status = 'PROCESSED'
        AND NOT EXISTS (
          SELECT 1 FROM shipments s WHERE s.order_order_id = ei.order_id
        )
      GROUP BY ei.order_id
      LIMIT 10
    `);

    if (partialStates.rows.length > 0) {
      check.status = "fail";
      check.details = `Found ${partialStates.rows.length} orders with processed courier events but no shipments`;
      check.data = { partialStates: partialStates.rows };
    } else {
      check.details =
        "All processed courier events have corresponding shipments - atomicity maintained";
    }

    // Also check for orphaned shipments
    const orphanedShipments = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text as count
      FROM shipments s
      WHERE NOT EXISTS (
        SELECT 1 FROM orders o WHERE o.order_id = s.order_order_id
      )
    `);

    const orphanCount = parseInt(orphanedShipments.rows[0]?.count || "0", 10);
    if (orphanCount > 0) {
      check.status = "fail";
      check.details += ` | Found ${orphanCount} orphaned shipments without orders`;
    }

    check.data = {
      ...check.data,
      orphanedShipments: orphanCount,
    };
  } catch (err) {
    check.status = "fail";
    check.details = `Query failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return check;
}

async function validateQueueDrainage(client: Client): Promise<ValidationCheck> {
  const check: ValidationCheck = {
    name: "Queue Drainage",
    description:
      "Verifies that all PGMQ queues are empty after processing completes",
    status: "pass",
    details: "",
    data: {},
  };

  const queueStats: QueueStats[] = [];

  try {
    // Check ingest_events queue
    const ingestQueue = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text as count FROM pgmq.q_ingest_events
    `);
    queueStats.push({
      queueName: "ingest_events",
      messageCount: parseInt(ingestQueue.rows[0]?.count || "0", 10),
    });

    // Check shopify_outbound queue
    const outboundQueue = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text as count FROM pgmq.q_shopify_outbound
    `);
    queueStats.push({
      queueName: "shopify_outbound",
      messageCount: parseInt(outboundQueue.rows[0]?.count || "0", 10),
    });

    const totalPending = queueStats.reduce((sum, q) => sum + q.messageCount, 0);

    if (totalPending > 0) {
      check.status = "warning";
      check.details = `${totalPending} messages still pending in queues`;
    } else {
      check.details = "All queues drained - no pending messages";
    }

    check.data = { queueStats };
  } catch (err) {
    // Queue tables might not exist if no messages were ever sent
    check.status = "warning";
    check.details = `Could not verify queue status: ${err instanceof Error ? err.message : String(err)}`;
  }

  return check;
}

async function validateDataIntegrity(
  client: Client,
  options: ValidatorOptions
): Promise<ValidationCheck> {
  const check: ValidationCheck = {
    name: "Data Integrity",
    description: "Verifies general data integrity constraints",
    status: "pass",
    details: "",
    data: {},
  };

  const issues: string[] = [];

  try {
    // Check for orders with null required fields
    const nullFields = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text as count 
      FROM orders 
      WHERE order_id IS NULL OR customer_id IS NULL OR status IS NULL
    `);
    const nullCount = parseInt(nullFields.rows[0]?.count || "0", 10);
    if (nullCount > 0) {
      issues.push(`${nullCount} orders with null required fields`);
    }

    // Check for invalid lastEventTs (in the future beyond tolerance)
    const futureTs = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text as count 
      FROM orders 
      WHERE last_event_ts > NOW() + INTERVAL '1 hour'
    `);
    const futureCount = parseInt(futureTs.rows[0]?.count || "0", 10);
    if (futureCount > 0) {
      issues.push(`${futureCount} orders with lastEventTs far in the future`);
    }

    // Check for negative amounts
    const negativeAmounts = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text as count 
      FROM orders 
      WHERE total_amount < 0 OR shipping_fee_cents < 0
    `);
    const negativeCount = parseInt(negativeAmounts.rows[0]?.count || "0", 10);
    if (negativeCount > 0) {
      issues.push(`${negativeCount} orders with negative amounts`);
    }

    if (issues.length > 0) {
      check.status = "fail";
      check.details = issues.join("; ");
    } else {
      check.details = "All data integrity checks passed";
    }

    check.data = { issues };
  } catch (err) {
    check.status = "fail";
    check.details = `Query failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return check;
}

async function validateFlashSaleConsistency(
  client: Client,
  flashSaleResult: FlashSaleResult,
  prefix: string
): Promise<ValidationCheck> {
  const check: ValidationCheck = {
    name: "Flash Sale Consistency",
    description: "Verifies flash sale orders were processed consistently",
    status: "pass",
    details: "",
    data: {},
  };

  try {
    // Count actual orders in DB
    const ordersResult = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text as count FROM orders WHERE order_id LIKE $1
    `, [`${prefix}%`]);
    const actualOrders = parseInt(ordersResult.rows[0]?.count || "0", 10);

    // Count inbox events
    const inboxResult = await client.query<{ status: string; count: string }>(`
      SELECT status, COUNT(*)::text as count 
      FROM event_inbox 
      WHERE order_id LIKE $1 
      GROUP BY status
    `, [`${prefix}%`]);

    const statusCounts: Record<string, number> = {};
    for (const row of inboxResult.rows) {
      statusCounts[row.status] = parseInt(row.count, 10);
    }

    const processedCount = statusCounts["PROCESSED"] || 0;
    const receivedCount = statusCounts["RECEIVED"] || 0;
    const failedCount = statusCounts["FAILED"] || 0;

    // Calculate success rate
    const { totalOrdersAttempted } = flashSaleResult.metrics;
    const successRate = totalOrdersAttempted > 0 
      ? (actualOrders / totalOrdersAttempted) * 100 
      : 0;

    if (failedCount > 0) {
      check.status = "warning";
      check.details = `${failedCount} events failed processing`;
    }

    if (receivedCount > 0) {
      check.status = "warning";
      check.details += ` | ${receivedCount} events still in RECEIVED state`;
    }

    if (successRate < 95) {
      check.status = "fail";
      check.details = `Only ${successRate.toFixed(1)}% success rate (${actualOrders}/${totalOrdersAttempted})`;
    }

    if (check.status === "pass") {
      check.details = `${actualOrders} orders created successfully (${successRate.toFixed(1)}% rate)`;
    }

    check.data = {
      actualOrders,
      attemptedOrders: totalOrdersAttempted,
      successRate: successRate.toFixed(2) + "%",
      statusCounts,
    };
  } catch (err) {
    check.status = "fail";
    check.details = `Query failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return check;
}

// ============================================================================
// Utility Functions
// ============================================================================

export async function getOverallStats(
  client: Client
): Promise<Record<string, unknown>> {
  const stats: Record<string, unknown> = {};

  try {
    // Total orders
    const ordersResult = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text as count FROM orders"
    );
    stats.totalOrders = parseInt(ordersResult.rows[0]?.count || "0", 10);

    // Total shipments
    const shipmentsResult = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text as count FROM shipments"
    );
    stats.totalShipments = parseInt(shipmentsResult.rows[0]?.count || "0", 10);

    // Event inbox by status
    const inboxResult = await client.query<{ status: string; count: string }>(
      "SELECT status, COUNT(*)::text as count FROM event_inbox GROUP BY status"
    );
    stats.eventInboxByStatus = Object.fromEntries(
      inboxResult.rows.map((r) => [r.status, parseInt(r.count, 10)])
    );

    // Total events
    const totalEventsResult = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text as count FROM event_inbox"
    );
    stats.totalEvents = parseInt(totalEventsResult.rows[0]?.count || "0", 10);
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
  }

  return stats;
}
