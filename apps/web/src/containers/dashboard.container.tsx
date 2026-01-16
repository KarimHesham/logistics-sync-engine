"use client";

import React, { useState } from "react";
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
} from "@mui/material";
import { useOrdersQuery } from "../modules/orders/hooks/use-orders-query";
import {
  OrdersTable,
  OrderUI,
} from "../modules/orders/components/orders-table";
import { EditAddressForm } from "../modules/orders/components/edit-address-form";

export function DashboardContainer() {
  const { data: orders, isLoading, error } = useOrdersQuery();
  const [editingOrder, setEditingOrder] = useState<OrderUI | null>(null);

  const handleEdit = (order: OrderUI) => {
    setEditingOrder(order);
  };

  const handleClose = () => {
    setEditingOrder(null);
  };

  const handleSave = async (orderId: string, updates: any) => {
    console.log("Saving", orderId, updates);
    // Ideally calls a mutation here
    setEditingOrder(null);
  };

  // Ensure we pass the LIVE object from the store to the form to enable conflict detection via SSE updates
  const liveEditingOrder =
    orders?.find((o) => o.orderId === editingOrder?.orderId) || editingOrder;

  if (isLoading)
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  if (error) return <Alert severity="error">Failed to load orders</Alert>;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Orders Dashboard
      </Typography>

      {orders && <OrdersTable data={orders as OrderUI[]} onEdit={handleEdit} />}

      {/* 
        We use liveEditingOrder so that if the background query updates 
        (via SSE), the form receives the new props and triggers conflict logic.
      */}
      <EditAddressForm
        open={!!editingOrder}
        order={liveEditingOrder as OrderUI | null}
        onClose={handleClose}
        onSave={handleSave}
      />
    </Container>
  );
}
