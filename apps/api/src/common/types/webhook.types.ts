export interface ShopifyOrderPayload {
  id: number | string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface CourierEventPayload {
  orderId: string;
  eventType: string;
  eventTs: string;
  [key: string]: unknown;
}
