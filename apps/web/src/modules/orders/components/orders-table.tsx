"use client";

import React, { useRef } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Box, Paper, Typography, IconButton, styled } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { orders } from "@repo/dtos";
import clsx from "clsx";

// Extend DTO to include address for UI purposes
export type OrderUI = orders.OrderListResponseDto & { address?: string };

const columnHelper = createColumnHelper<OrderUI>();

interface OrdersTableProps {
  data: OrderUI[];
  onEdit: (order: OrderUI) => void;
}

// Styled components for "Div Table"
const TableContainer = styled("div")({
  height: "600px", // Fixed height for virtualization
  overflow: "auto",
  border: "1px solid #e0e0e0",
  borderRadius: "4px",
});

const TableHeader = styled("div")(({ theme }) => ({
  display: "flex",
  position: "sticky",
  top: 0,
  zIndex: 1,
  backgroundColor: theme.palette.background.paper,
  borderBottom: "1px solid #e0e0e0",
  fontWeight: "bold",
}));

const TableRow = styled("div")(({ theme }) => ({
  display: "flex",
  borderBottom: "1px solid #f0f0f0",
  alignItems: "center",
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },
}));

const TableCell = styled("div")({
  padding: "8px 16px",
  flex: 1,
  display: "flex",
  alignItems: "center",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export function OrdersTable({ data, onEdit }: OrdersTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const columns = [
    columnHelper.accessor("orderId", {
      header: "Order ID",
      size: 100,
    }),
    columnHelper.accessor("customerId", {
      header: "Customer",
      size: 150,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      size: 100,
    }),
    columnHelper.accessor("totalAmount", {
      header: "Amount",
      cell: (info) => `$${info.getValue()}`,
      size: 100,
    }),
    // Address column (mocked access)
    columnHelper.accessor("address", {
      header: "Address",
      cell: (info) => info.getValue() || "N/A", // Show N/A if missing
      size: 200,
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      cell: (props) => (
        <IconButton size="small" onClick={() => onEdit(props.row.original)}>
          <EditIcon fontSize="small" />
        </IconButton>
      ),
      size: 60,
    }),
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Row height
    overscan: 5,
  });

  return (
    <Paper elevation={0} sx={{ width: "100%", overflow: "hidden" }}>
      <TableContainer ref={parentRef}>
        {/* Header */}
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <React.Fragment key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableCell
                  key={header.id}
                  style={{
                    // Use inline style for width from column def per Tanstack advice or flex
                    flex: header.column.getSize()
                      ? `0 0 ${header.column.getSize()}px`
                      : 1,
                  }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableCell>
              ))}
            </React.Fragment>
          ))}
        </TableHeader>

        {/* Rows */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <TableRow
                key={row.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    style={{
                      flex: cell.column.getSize()
                        ? `0 0 ${cell.column.getSize()}px`
                        : 1,
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </div>
      </TableContainer>
    </Paper>
  );
}
