import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { fetchOrders } from "@/src/modules/orders/apis/orders.api";
import { DashboardContainer } from "@/src/containers/dashboard.container";

// Force dynamic rendering to ensure we always fetch fresh data on the server
export const dynamic = "force-dynamic";

export default async function Home() {
  const queryClient = new QueryClient();

  // Prefetch data on server
  await queryClient.prefetchQuery({
    queryKey: ["orders"],
    queryFn: () => fetchOrders(undefined, 100),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardContainer />
    </HydrationBoundary>
  );
}
