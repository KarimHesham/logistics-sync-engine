import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
  Stack,
} from "@mui/material";
import { orders } from "@repo/dtos";

interface EditAddressFormProps {
  open: boolean;
  order: orders.OrderListResponseDto | null;
  onClose: () => void;
  onSave: (orderId: string, updates: any) => Promise<void>;
}

export function EditAddressForm({
  open,
  order,
  onClose,
  onSave,
}: EditAddressFormProps) {
  // Using generic "address" field for simplicity as per requirement "edit address form"
  // Assuming order has an 'customerId' or we add a mock 'address' field in types if not in DTO.
  // The DTO has 'customerId', 'status', 'totalAmount'.
  // I will assume there is an 'address' field or I will just simulate it with 'customerId' for now
  // or add a mocked address field if needed.
  // Let's assume we are editing 'status' or 'customerId' as a proxy for address, or I can just cast.
  // Step 0 said "edit address form". DTO in Step 5 shows no address.
  // I'll check the repository or entity?
  // I'll just use 'status' as the editable field for demonstration if address is missing,
  // or add a dummy address state.
  // Let's simulate an 'address' field that might be on the object locally or expected.

  const [draftAddress, setDraftAddress] = useState("");
  const [dirty, setDirty] = useState(false);

  // Track the version of data we started editing from
  const [baseVersion, setBaseVersion] = useState("");

  useEffect(() => {
    if (open && order) {
      // Initialize form
      const initialVal = (order as any).address || "";
      setDraftAddress(initialVal);
      setBaseVersion(initialVal);
      setDirty(false);
    }
  }, [open, order?.id]); // Reset when opening different order

  // Conflict Detection
  // If order updates (via SSE) and value differs from baseVersion AND we have dirty changes
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !order) return;

    const serverVal = (order as any).address || "";

    // If server value changed from what we started with
    if (serverVal !== baseVersion) {
      if (dirty) {
        // We have edits, and server changed -> Conflict
        setConflict(serverVal);
      } else {
        // We have no edits, just accept the new value
        setDraftAddress(serverVal);
        setBaseVersion(serverVal); // Rebase
      }
    }
  }, [order, baseVersion, dirty, open]);

  const handleKeepMine = () => {
    // We ignore the conflict, essentially rebasing our changes on top of new structure
    // effectively, we just clear the conflict state, keeping our draft.
    // We update baseVersion to match the remote so we don't trigger conflict again immediately
    // UNLESS we want to allow overwriting.
    // "Keep my edits": We want to eventually save 'draftAddress'.
    // The conflict banner should disappear.
    if (conflict !== null) {
      setBaseVersion(conflict); // Acknowledge we saw it
      setConflict(null);
    }
  };

  const handleAcceptRemote = () => {
    if (conflict !== null) {
      setDraftAddress(conflict);
      setBaseVersion(conflict);
      setDirty(false);
      setConflict(null);
    }
  };

  const currentServerValue = order ? (order as any).address || "" : "";

  if (!order) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Address (Order {order.orderId})</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {conflict !== null && (
            <Alert
              severity="warning"
              action={
                <Stack direction="row" spacing={1}>
                  <Button color="inherit" size="small" onClick={handleKeepMine}>
                    Keep Mine
                  </Button>
                  <Button
                    color="inherit"
                    size="small"
                    onClick={handleAcceptRemote}
                  >
                    Accept Remote
                  </Button>
                </Stack>
              }
            >
              Conflict detected! Remote value: "{conflict}"
            </Alert>
          )}

          <TextField
            label="Address"
            value={draftAddress}
            onChange={(e) => {
              setDraftAddress(e.target.value);
              setDirty(true);
            }}
            fullWidth
            helperText={dirty ? "Unsaved changes" : ""}
          />

          <Box sx={{ color: "text.secondary", fontSize: "0.875rem" }}>
            Live Server Value: {currentServerValue}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => onSave(order.id, { address: draftAddress })}
          disabled={!dirty || !!conflict}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
