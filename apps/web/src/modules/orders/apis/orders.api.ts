import { orders } from "@repo/dtos";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function fetchOrders(
  cursor?: string,
  limit: number = 100
): Promise<orders.OrderListResponseDto[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });
  if (cursor) {
    params.set("cursor", cursor);
  }

  // Using fetch directly. For SSR, ensure absolute URL.
  // We disable caching for fresh data on refresh, or use appropriate revalidation.
  const res = await fetch(`${API_BASE_URL}/orders?${params.toString()}`, {
    cache: "no-store", // or 'force-cache' with revalidation
  });

  if (!res.ok) {
    throw new Error("Failed to fetch orders");
  }

  return res.json();
}
