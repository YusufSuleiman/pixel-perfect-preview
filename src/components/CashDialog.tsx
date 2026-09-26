import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { today } from "@/lib/format";
import type { CashMovement } from "@/lib/accounting";

const schema = z.object({
  amount: z.number().positive({ message: "Amount must be greater than zero" }).max(1_000_000_000),
  move_date: z.string().min(10, { message: "Pick a date" }),
  description: z.string().trim().max(300).optional(),
});

export function CashDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
  defaultKind = "DEPOSIT",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  editing?: CashMovement | null;
  defaultKind?: CashMovement["kind"];
}) {
  const [kind, setKind] = useState<CashMovement["kind"]>(defaultKind);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setKind(editing.kind);
      setAmount(String(editing.amount));
      setDate(editing.move_date);
      setDescription(editing.description ?? "");
    } else {
      setKind(defaultKind);
      setAmount("");
      setDate(today());
      setDescription("");
    }
  }, [open, editing, defaultKind]);

  async function save() {
    const parsed = schema.safeParse({
      amount: Number(amount) || 0,
      move_date: date,
      description: description || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const payload = {
        user_id: auth.user.id,
        kind,
        amount: parsed.data.amount,
        move_date: parsed.data.move_date,
        description: parsed.data.description ?? null,
      };
      const res = editing
        ? await supabase.from("cash_movements").update(payload).eq("id", editing.id)
        : await supabase.from("cash_movements").insert(payload);
      if (res.error) throw res.error;
      toast.success(editing ? "Cash movement updated" : "Cash movement recorded");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit cash movement" : "Cash movement"}</DialogTitle>
          <DialogDescription>
            Deposits add new capital. Withdrawals and fees draw on capital and profit in proportion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as CashMovement["kind"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEPOSIT">Add new capital (deposit)</SelectItem>
                <SelectItem value="WITHDRAWAL">Withdraw money</SelectItem>
                <SelectItem value="FEE">Other fee / expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cash-amount">Amount</Label>
              <Input
                id="cash-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1015"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cash-date">Date</Label>
              <Input id="cash-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-desc">Description {kind === "WITHDRAWAL" ? "(reason)" : "(optional)"}</Label>
            <Input
              id="cash-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
