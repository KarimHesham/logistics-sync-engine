// ============================================================================
// Fincart Automated Test Suite
// ============================================================================
//
// This package provides automated testing for the Fincart logistics platform,
// including the flash sale scenario and chaos test as specified in the
// Senior Full-Stack Task requirements.
//
// USAGE:
//   pnpm test               - Run full test suite
//   pnpm test:quick         - Quick test with reduced orders
//   pnpm test:flash-sale    - Run only flash sale scenario
//   pnpm test:chaos         - Run only chaos test scenario
//   pnpm test:verbose       - Run with verbose output and raw data
//
// ENVIRONMENT VARIABLES:
//   Create a .env file in this directory with:
//   - SUPABASE_DATABASE_URL=postgresql://... (required)
//   - API_URL=http://localhost:4000 (optional)
//   - MOCK_SHOPIFY_URL=http://localhost:4001 (optional)
//
// ============================================================================

export { runTestSuite } from "./test-suite";
export * from "./types";
export * from "./scenarios";
export * from "./validators";
export * from "./reporters";

console.log(`
╔══════════════════════════════════════════════════════════════╗
║           FINCART AUTOMATED TEST SUITE                       ║
╠══════════════════════════════════════════════════════════════╣
║  Usage:                                                      ║
║    pnpm test            - Run full test suite                ║
║    pnpm test:quick      - Quick test (100 orders)            ║
║    pnpm test:flash-sale - Flash sale only                    ║
║    pnpm test:chaos      - Chaos test only                    ║
║    pnpm test:verbose    - Verbose with raw data              ║
║                                                              ║
║  Flags:                                                      ║
║    --orders <n>         - Number of orders (default: 5000)   ║
║    --chaos-events <n>   - Chaos events (default: 100)        ║
║    --verbose            - Enable verbose output              ║
║    --help               - Show all options                   ║
╚══════════════════════════════════════════════════════════════╝

To run the test suite: pnpm test
`);
