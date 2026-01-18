#!/usr/bin/env tsx
// ============================================================================
// Automated Test Suite - Main Orchestrator
// Runs flash sale and chaos test scenarios sequentially, validates results,
// and generates a comprehensive Markdown report
// ============================================================================

import * as dotenv from "dotenv";
import * as path from "path";
import { Client } from "pg";
import { randomUUID } from "crypto";

import type { TestConfig, TestSuiteResult } from "./types";
import { runFlashSale, type FlashSaleOptions } from "./scenarios/flash-sale";
import { runChaosTest, type ChaosTestOptions } from "./scenarios/chaos-test";
import { runValidations, getOverallStats } from "./validators";
import {
  generateMarkdownReport,
  printSummaryToConsole,
} from "./reporters/markdown";

// Load environment variables
const envPath = path.resolve(__dirname, "./.env");
dotenv.config({ path: envPath });

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: TestConfig = {
  apiUrl: process.env.API_URL || "http://localhost:4000",
  databaseUrl: process.env.SUPABASE_DATABASE_URL || "",
  mockShopifyUrl: process.env.MOCK_SHOPIFY_URL || "http://localhost:4001",
};

interface TestSuiteOptions {
  skipFlashSale?: boolean;
  skipChaosTest?: boolean;
  flashSaleOptions?: FlashSaleOptions;
  chaosTestOptions?: ChaosTestOptions;
  reportPath?: string;
  verbose?: boolean;
  includeRawData?: boolean;
}

// ============================================================================
// Main Test Suite Runner
// ============================================================================

export async function runTestSuite(
  options: TestSuiteOptions = {}
): Promise<TestSuiteResult> {
  const config = DEFAULT_CONFIG;
  const runId = randomUUID().slice(0, 8);
  const startTime = new Date();

  console.log("=".repeat(60));
  console.log("FINCART AUTOMATED TEST SUITE");
  console.log("=".repeat(60));
  console.log(`Run ID: ${runId}`);
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`Started: ${startTime.toISOString()}`);
  console.log("=".repeat(60));
  console.log("");

  // Validate configuration
  if (!config.databaseUrl) {
    console.error(
      "ERROR: SUPABASE_DATABASE_URL environment variable is required"
    );
    console.error("Please create a .env file in scripts/chaos/ with:");
    console.error("  SUPABASE_DATABASE_URL=postgresql://...");
    console.error("  API_URL=http://localhost:4000");
    process.exit(1);
  }

  // Initialize result
  const result: TestSuiteResult = {
    runId,
    startTime,
    endTime: new Date(),
    durationMs: 0,
    config,
    scenarios: {},
    validation: {
      checks: [],
      passCount: 0,
      failCount: 0,
      warningCount: 0,
      skippedCount: 0,
      overallStatus: "pass",
    },
    overallSuccess: true,
    summary: "",
  };

  // Track flash sale prefix for validation
  let flashSalePrefix: string | undefined;
  let chaosOrderId: string | undefined;

  try {
    // ========================================================================
    // Phase 1: Flash Sale Scenario
    // ========================================================================
    if (!options.skipFlashSale) {
      console.log("\n" + "─".repeat(60));
      console.log("PHASE 1: FLASH SALE SCENARIO");
      console.log("─".repeat(60));

      const flashSaleOpts: FlashSaleOptions = {
        orderCount: 5000,
        durationSec: 60, // Spread over 2 minutes for stability
        batchSize: 100,
        waitTimeMs: 20000,
        webhooksPerOrder: 1,
        courierEventsPerOrder: 1,
        concurrencyLimit: 10,
        ...options.flashSaleOptions,
      };

      console.log(`Configuration:`);
      console.log(`  - Orders: ${flashSaleOpts.orderCount}`);
      console.log(`  - Duration: ${flashSaleOpts.durationSec}s`);
      console.log(`  - Batch Size: ${flashSaleOpts.batchSize}`);
      console.log(`  - Concurrency Limit: ${flashSaleOpts.concurrencyLimit}`);
      console.log(`  - Webhooks per Order: ${flashSaleOpts.webhooksPerOrder}`);
      console.log(
        `  - Courier Events per Order: ${flashSaleOpts.courierEventsPerOrder}`
      );
      console.log("");

      const flashSaleResult = await runFlashSale(config, flashSaleOpts);
      result.scenarios.flashSale = flashSaleResult;

      // Extract prefix from first order ID for validation
      if (flashSaleResult.metrics.ordersCreated > 0) {
        flashSalePrefix = `flash-`;
      }

      console.log("");
      console.log(
        `Flash Sale ${flashSaleResult.success ? "✅ PASSED" : "❌ FAILED"}`
      );
      console.log(
        `  Created: ${flashSaleResult.metrics.ordersCreated}/${flashSaleResult.metrics.totalOrdersAttempted} orders`
      );
      console.log(`  Duration: ${flashSaleResult.durationMs}ms`);

      if (!flashSaleResult.success) {
        result.overallSuccess = false;
      }
    } else {
      console.log("\n[Skipping Flash Sale Scenario]");
    }

    // ========================================================================
    // Phase 2: Chaos Test Scenario
    // ========================================================================
    if (!options.skipChaosTest) {
      console.log("\n" + "─".repeat(60));
      console.log("PHASE 2: CHAOS TEST SCENARIO");
      console.log("─".repeat(60));

      const chaosOpts: ChaosTestOptions = {
        numEvents: 100,
        waitTimeMs: 10000,
        concurrencyLimit: 20,
        simultaneous: true, // Fire all 100 events at once (as per task requirements)
        ...options.chaosTestOptions,
      };

      console.log(`Configuration:`);
      console.log(`  - Total Events: ${chaosOpts.numEvents}`);
      console.log(
        `  - Execution Mode: ${
          chaosOpts.simultaneous
            ? "SIMULTANEOUS (all at once)"
            : `Throttled (${chaosOpts.concurrencyLimit} concurrent)`
        }`
      );
      console.log(`  - Wait Time: ${chaosOpts.waitTimeMs}ms`);
      console.log("");

      const chaosTestResult = await runChaosTest(config, chaosOpts);
      result.scenarios.chaosTest = chaosTestResult;
      chaosOrderId = chaosTestResult.metrics.orderId;

      console.log("");
      console.log(
        `Chaos Test ${chaosTestResult.success ? "✅ PASSED" : "❌ FAILED"}`
      );
      console.log(`  Order ID: ${chaosTestResult.metrics.orderId}`);
      console.log(`  Events: ${chaosTestResult.metrics.totalEventsGenerated}`);
      console.log(
        `  Timestamp Valid: ${
          chaosTestResult.metrics.timestampMatchValid ? "Yes" : "No"
        }`
      );
      console.log(`  Duration: ${chaosTestResult.durationMs}ms`);

      if (!chaosTestResult.success) {
        result.overallSuccess = false;
      }
    } else {
      console.log("\n[Skipping Chaos Test Scenario]");
    }

    // ========================================================================
    // Phase 3: Validation
    // ========================================================================
    console.log("\n" + "─".repeat(60));
    console.log("PHASE 3: VALIDATION");
    console.log("─".repeat(60));

    const client = new Client({ connectionString: config.databaseUrl });
    await client.connect();

    try {
      // Run all validations
      result.validation = await runValidations(
        client,
        result.scenarios.flashSale,
        result.scenarios.chaosTest,
        {
          flashSalePrefix,
          chaosOrderId,
          verbose: options.verbose,
        }
      );

      // Get overall stats
      const stats = await getOverallStats(client);
      console.log("\nDatabase Stats:");
      console.log(`  - Total Orders: ${stats.totalOrders}`);
      console.log(`  - Total Shipments: ${stats.totalShipments}`);
      console.log(`  - Total Events: ${stats.totalEvents}`);

      console.log("\nValidation Results:");
      for (const check of result.validation.checks) {
        const icon =
          check.status === "pass"
            ? "✅"
            : check.status === "fail"
            ? "❌"
            : check.status === "warning"
            ? "⚠️"
            : "⏭️";
        console.log(`  ${icon} ${check.name}: ${check.status}`);
      }

      if (result.validation.failCount > 0) {
        result.overallSuccess = false;
      }
    } finally {
      await client.end();
    }

    // ========================================================================
    // Phase 4: Report Generation
    // ========================================================================
    console.log("\n" + "─".repeat(60));
    console.log("PHASE 4: REPORT GENERATION");
    console.log("─".repeat(60));

    result.endTime = new Date();
    result.durationMs = result.endTime.getTime() - startTime.getTime();
    result.summary = result.overallSuccess
      ? "All tests passed successfully"
      : "Some tests failed - review report for details";

    const reportPath = options.reportPath || `./test-report-${runId}.md`;
    generateMarkdownReport(result, {
      outputPath: reportPath,
      verbose: options.verbose,
      includeRawData: options.includeRawData,
    });

    // Print summary to console
    printSummaryToConsole(result);
  } catch (err) {
    result.overallSuccess = false;
    result.summary = `Test suite failed: ${
      err instanceof Error ? err.message : String(err)
    }`;
    console.error("\n❌ TEST SUITE FAILED:", err);
  }

  return result;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

function parseArgs(): TestSuiteOptions {
  const args = process.argv.slice(2);
  const options: TestSuiteOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--skip-flash-sale":
        options.skipFlashSale = true;
        break;
      case "--skip-chaos":
        options.skipChaosTest = true;
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--include-raw":
        options.includeRawData = true;
        break;
      case "--report":
      case "-o":
        options.reportPath = args[++i];
        break;
      case "--orders":
        options.flashSaleOptions = {
          ...options.flashSaleOptions,
          orderCount: parseInt(args[++i], 10),
        };
        break;
      case "--duration":
        options.flashSaleOptions = {
          ...options.flashSaleOptions,
          durationSec: parseInt(args[++i], 10),
        };
        break;
      case "--chaos-events":
        options.chaosTestOptions = {
          ...options.chaosTestOptions,
          numEvents: parseInt(args[++i], 10),
        };
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Fincart Automated Test Suite

Usage: pnpm test [options]

Options:
  --skip-flash-sale     Skip the flash sale scenario
  --skip-chaos          Skip the chaos test scenario
  --verbose, -v         Enable verbose output
  --include-raw         Include raw data in report
  --report, -o <path>   Output report to specified path
  --orders <n>          Number of orders for flash sale (default: 5000)
  --duration <s>        Duration in seconds for flash sale (default: 60)
  --chaos-events <n>    Number of chaos events (default: 100)
  --help, -h            Show this help message

Environment Variables:
  SUPABASE_DATABASE_URL  PostgreSQL connection string (required)
  API_URL                API endpoint (default: http://localhost:4000)
  MOCK_SHOPIFY_URL       Mock Shopify endpoint (default: http://localhost:4001)

Examples:
  # Run full test suite
  pnpm test

  # Run only chaos test
  pnpm test --skip-flash-sale

  # Run with fewer orders (for quick testing)
  pnpm test --orders 100 --duration 10

  # Generate verbose report
  pnpm test --verbose --include-raw
`);
}

// Run if executed directly
const isMainModule = require.main === module;
if (isMainModule) {
  const options = parseArgs();

  runTestSuite(options)
    .then((result) => {
      process.exit(result.overallSuccess ? 0 : 1);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
