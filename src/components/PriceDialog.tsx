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

const schema = z.object({
  ticker: z.string().trim().min(1).max(15),
  price: z.number().nonnegative().max(10_000_000),
});

export function PriceDialog({
  open,
  onOpenChange,
  onSaved,
  ticker,
  currentPrice,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  ticker: string;
  currentPrice?: number | null;
}) {
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setPrice(currentPrice != null ? String(currentPrice) : "");
  }, [open, currentPrice]);

  async function save() {
    const parsed = schema.safeParse({ ticker, price: Number(price) || 0 });
    if (!parsed.success) {
      toast.error("Enter a valid price");
      return;
    }
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase.from("market_prices").upsert({
        user_id: auth.user.id,
        ticker: parsed.data.ticker.toUpperCase(),
        price: parsed.data.price,
        source: "MANUAL",
        as_of: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(`${ticker} price updated (manually entered)`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the price");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update {ticker} price</DialogTitle>
          <DialogDescription>
            This is a manually entered price, not a live market quote. It is labelled as such everywhere it is used.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="price-input">Current price per share</Label>
          <Input id="price-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
