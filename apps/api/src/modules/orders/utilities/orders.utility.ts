export class OrdersUtil {
  static normalizeOrderId(orderId: string): string {
    return orderId.trim().toUpperCase();
  }
}
