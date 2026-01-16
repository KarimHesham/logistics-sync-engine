import { orders } from "@repo/dtos";

// Client-specific state for the Order Row
export interface OrderRowState {
  isEditing: boolean;
  hasConflict: boolean;
  localDraft?: Partial<orders.OrderListResponseDto>;
}

// Event payload structure (inferred from previous tasks)
export interface ShipmentUpdateEvent {
  orderId: string;
  shipmentId: string; // or potentially just order-level updates?
  serverTs: number;
  changedFields: string[]; // e.g. ['status', 'address']
  summary?: string;
}

// Conflict detected
export interface ConflictState {
  orderId: string;
  field: string;
  remoteValue: string;
  localValue: string;
  serverTs: number;
}
