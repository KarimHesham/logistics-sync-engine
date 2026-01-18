// ============================================================================
// Automated Test Suite - Shared Types
// ============================================================================

export interface TestConfig {
  apiUrl: string;
  databaseUrl: string;
  mockShopifyUrl: string;
}

// ============================================================================
// Scenario Results
// ============================================================================

export interface ScenarioResult {
  name: string;
  success: boolean;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  metrics: Record<string, number | string>;
  errors: string[];
  warnings: string[];
}

export interface FlashSaleResult extends ScenarioResult {
  name: "flash-sale";
  metrics: {
    totalOrdersAttempted: number;
    ordersCreated: number;
    webhooksSent: number;
    courierEventsSent: number;
    duplicatesGenerated: number;
    duplicatesHandled: number;
    avgProcessingTimeMs: number;
    peakOrdersPerSecond: number;
  };
}

export interface ChaosTestResult extends ScenarioResult {
  name: "chaos-test";
  metrics: {
    orderId: string;
    totalEventsGenerated: number;
    shopifyEvents: number;
    courierEvents: number;
    duplicatesGenerated: number;
    expectedMaxTimestamp: string;
    actualLastEventTs: string;
    timestampMatchValid: boolean;
    shipmentExists: boolean;
    inboxItemsProcessed: number;
  };
}

// ============================================================================
// Validation Results
// ============================================================================

export type ValidationStatus = "pass" | "fail" | "warning" | "skipped";

export interface ValidationCheck {
  name: string;
  description: string;
  status: ValidationStatus;
  details: string;
  data?: Record<string, unknown>;
}

export interface ValidationResult {
  checks: ValidationCheck[];
  passCount: number;
  failCount: number;
  warningCount: number;
  skippedCount: number;
  overallStatus: ValidationStatus;
}

// ============================================================================
// Test Suite Results
// ============================================================================

export interface TestSuiteResult {
  runId: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  config: TestConfig;
  scenarios: {
    flashSale?: FlashSaleResult;
    chaosTest?: ChaosTestResult;
  };
  validation: ValidationResult;
  overallSuccess: boolean;
  summary: string;
}

// ============================================================================
// Database Query Types
// ============================================================================

export interface EventInboxStats {
  status: string;
  count: number;
}

export interface QueueStats {
  queueName: string;
  messageCount: number;
  oldestMessageAge?: number;
}

export interface OrderSnapshot {
  id: string;
  orderId: string;
  customerId: string;
  status: string;
  totalAmount: number;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  shippingFeeCents: number;
  lastEventTs: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentSnapshot {
  id: string;
  orderOrderId: string;
  courierStatus: string;
  trackingNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Event Generation Types
// ============================================================================

export interface GeneratedEvent {
  type: "shopify" | "courier";
  orderId: string;
  timestamp: Date;
  webhookId?: string;
  isDuplicate?: boolean;
  payload: Record<string, unknown>;
}

export interface EventGenerationStats {
  total: number;
  shopify: number;
  courier: number;
  duplicates: number;
}

// ============================================================================
// Report Types
// ============================================================================

export interface ReportOptions {
  outputPath: string;
  includeRawData: boolean;
  verbose: boolean;
}
