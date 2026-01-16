import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchOrders } from "../apis/orders.api";
import { orders } from "@repo/dtos";
import { ShipmentUpdateEvent } from "../types/orders.types";

export function useOrdersQuery() {
  const queryClient = useQueryClient();
  const queryKey = ["orders"];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchOrders(),
    staleTime: Infinity, // Rely on SSE for updates
  });

  useEffect(() => {
    // Only connect on client side
    if (typeof window === "undefined") return;

    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const eventSource = new EventSource(`${apiBaseUrl}/stream/shipments`);

    const handleUpdate = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as ShipmentUpdateEvent;

        // Optimistically update the cache
        queryClient.setQueryData<orders.OrderListResponseDto[]>(
          queryKey,
          (oldData) => {
            if (!oldData) return oldData;

            return oldData.map((order) => {
              if (
                order.id === payload.orderId ||
                order.orderId === payload.orderId
              ) {
                // For now, assuming the payload contains fields that map directly to OrderListResponseDto
                // Or we might need to be smarter if nested.
                // The user said "connect SSE to update store".
                // Ideally payload has the new partial state or we fetch.
                // I will assume payload.summary contains the updated fields or just spread payload
                // But payload types in 'orders.types.ts' has 'changedFields' and 'summary'.
                // I'll merge 'summary' into the order.
                return { ...order, ...payload.summary };
              }
              return order;
            });
          }
        );
      } catch (err) {
        console.error("Failed to parse SSE", err);
      }
    };

    // NestJS default event type for Observable<MessageEvent> usually defaults to 'message' if not specified,
    // but previous context said 'shipment_update'.
    eventSource.addEventListener("shipment_update", handleUpdate);

    return () => {
      eventSource.removeEventListener("shipment_update", handleUpdate);
      eventSource.close();
    };
  }, [queryClient]);

  return query;
}
