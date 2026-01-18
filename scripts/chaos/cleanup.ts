#!/usr/bin/env tsx
// ============================================================================
// Database Cleanup Script
// Purges PGMQ queues and deletes all rows from database tables
// ============================================================================

import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "node:path";

// Load environment variables
const envPath = path.resolve(__dirname, "./.env");
dotenv.config({ path: envPath });

const DB_URL = process.env.SUPABASE_DATABASE_URL;

if (!DB_URL) {
  console.error(
    "ERROR: SUPABASE_DATABASE_URL environment variable is required"
  );
  console.error("Please create a .env file in scripts/chaos/ with:");
  console.error("  SUPABASE_DATABASE_URL=postgresql://...");
  process.exit(1);
}

interface CleanupResult {
  table: string;
  rowsDeleted: number;
  success: boolean;
  error?: string;
}

async function purgeQueue(
  client: Client,
  queue: string
): Promise<CleanupResult> {
  try {
    const queueExists = await client.query(
      `SELECT 1 FROM pgmq.meta WHERE queue_name = $1`,
      [queue]
    );

    if (queueExists.rows.length === 0) {
      console.log(`⏭ Queue '${queue}' does not exist, skipping`);
      return { table: `pgmq.q_${queue}`, rowsDeleted: 0, success: true };
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::int as count FROM pgmq.q_${queue}`
    );
    const messageCount = countResult.rows[0]?.count || 0;

    await client.query(`SELECT pgmq.purge_queue($1)`, [queue]);
    console.log(`✓ Purged queue '${queue}' (${messageCount} messages removed)`);

    return {
      table: `pgmq.q_${queue}`,
      rowsDeleted: messageCount,
      success: true,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(`⚠ Could not purge queue '${queue}': ${errorMsg}`);
    return {
      table: `pgmq.q_${queue}`,
      rowsDeleted: 0,
      success: false,
      error: errorMsg,
    };
  }
}

async function clearTable(
  client: Client,
  table: string
): Promise<CleanupResult> {
  try {
    const countResult = await client.query(
      `SELECT COUNT(*)::int as count FROM ${table}`
    );
    const rowCount = countResult.rows[0]?.count || 0;

    await client.query(`DELETE FROM ${table}`);
    console.log(`✓ Cleared table '${table}' (${rowCount} rows deleted)`);

    return { table, rowsDeleted: rowCount, success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(`✗ Failed to clear table '${table}': ${errorMsg}`);
    return { table, rowsDeleted: 0, success: false, error: errorMsg };
  }
}

function printSummary(results: CleanupResult[]): boolean {
  console.log("");
  console.log("─".repeat(40));
  console.log("CLEANUP SUMMARY");
  console.log("─".repeat(40));

  const totalDeleted = results.reduce((sum, r) => sum + r.rowsDeleted, 0);
  const failures = results.filter((r) => !r.success);

  console.log(`Total rows/messages deleted: ${totalDeleted}`);
  console.log(`Tables/queues processed: ${results.length}`);
  console.log(`Failures: ${failures.length}`);

  if (failures.length > 0) {
    console.log("\nFailed operations:");
    for (const f of failures) {
      console.log(`  - ${f.table}: ${f.error}`);
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log(
    failures.length === 0
      ? "✓ CLEANUP COMPLETE"
      : "⚠ CLEANUP COMPLETED WITH ERRORS"
  );
  console.log("=".repeat(60));

  return failures.length === 0;
}

async function cleanup(): Promise<void> {
  const client = new Client({ connectionString: DB_URL });

  console.log("=".repeat(60));
  console.log("DATABASE CLEANUP");
  console.log("=".repeat(60));
  console.log("");

  try {
    await client.connect();
    console.log("✓ Connected to database\n");

    const results: CleanupResult[] = [];

    // 1. Purge PGMQ queues
    console.log("─".repeat(40));
    console.log("PURGING PGMQ QUEUES");
    console.log("─".repeat(40));

    const queues = ["ingest_events", "shopify_outbound"];
    for (const queue of queues) {
      results.push(await purgeQueue(client, queue));
    }

    console.log("");

    // 2. Delete from application tables (in correct order due to foreign keys)
    console.log("─".repeat(40));
    console.log("CLEARING APPLICATION TABLES");
    console.log("─".repeat(40));

    const tables = [
      "shipments", // Delete first (references orders)
      "event_inbox", // No foreign keys
      "orders", // Delete last (referenced by shipments)
    ];

    for (const table of tables) {
      results.push(await clearTable(client, table));
    }

    const success = printSummary(results);
    if (!success) {
      process.exit(1);
    }
  } catch (err) {
    console.error("\n✗ Cleanup failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run cleanup
await cleanup();
