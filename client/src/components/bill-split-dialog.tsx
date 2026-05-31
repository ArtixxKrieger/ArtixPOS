import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { Scissors, ChevronLeft, ChevronRight, Users } from "lucide-react";
import type { CartItem } from "@/hooks/use-cart";

export interface SplitPortion {
  personIndex: number;
  personLabel: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
}

interface BillSplitDialogProps {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  total: number;
  subtotal: number;
  tax: number;
  currency: string;
  onEqualSplitDone: () => void;
  onItemSplitCharge: (splits: SplitPortion[]) => void;
}

const PERSON_COLORS = [
  { bg: "bg-blue-500",    light: "bg-blue-50 dark:bg-blue-900/30",    text: "text-blue-600 dark:text-blue-400",    label: "P1" },
  { bg: "bg-emerald-500", light: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-400", label: "P2" },
  { bg: "bg-orange-500",  light: "bg-orange-50 dark:bg-orange-900/30",  text: "text-orange-600 dark:text-orange-400",  label: "P3" },
  { bg: "bg-purple-500",  light: "bg-purple-50 dark:bg-purple-900/30",  text: "text-purple-600 dark:text-purple-400",  label: "P4" },
  { bg: "bg-rose-500",    light: "bg-rose-50 dark:bg-rose-900/30",    text: "text-rose-600 dark:text-rose-400",    label: "P5" },
  { bg: "bg-teal-500",    light: "bg-teal-50 dark:bg-teal-900/30",    text: "text-teal-600 dark:text-teal-400",    label: "P6" },
];

function itemUnitPrice(item: CartItem): number {
  const base = item.size
    ? parseFloat(String(item.size.price)) || 0
    : parseFloat(String(item.product.price)) || 0;
  const modTotal = (item.modifiers ?? []).reduce(
    (s, m) => s + (parseFloat(String(m.price)) || 0), 0
  );
  return base + modTotal;
}

export function BillSplitDialog({
  open, onClose, cart, total, subtotal, tax, currency,
  onEqualSplitDone, onItemSplitCharge,
}: BillSplitDialogProps) {
  const [mode, setMode] = useState<"equal" | "items">("equal");
  const [equalPeople, setEqualPeople] = useState(2);
  const [itemAssignments, setItemAssignments] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    cart.forEach(item => { init[item.cartId] = 0; });
    return init;
  });

  const perPersonEqual = total / equalPeople;

  const splits = useMemo((): SplitPortion[] => {
    const groups: Record<number, CartItem[]> = {};
    cart.forEach(item => {
      const p = itemAssignments[item.cartId] ?? 0;
      if (!groups[p]) groups[p] = [];
      groups[p].push(item);
    });

    return Object.entries(groups).map(([pIdx, items]) => {
      const pSubtotal = items.reduce(
        (s, i) => s + itemUnitPrice(i) * i.quantity, 0
      );
      const pTax = subtotal > 0 ? (pSubtotal / subtotal) * tax : 0;
      return {
        personIndex: Number(pIdx),
        personLabel: PERSON_COLORS[Number(pIdx)]?.label ?? `P${Number(pIdx) + 1}`,
        items,
        subtotal: pSubtotal,
        tax: pTax,
        total: pSubtotal + pTax,
      };
    }).sort((a, b) => a.personIndex - b.personIndex);
  }, [cart, itemAssignments, subtotal, tax]);

  const usedPersonCount = useMemo(
    () => new Set(Object.values(itemAssignments)).size,
    [itemAssignments]
  );

  const cycleItem = (cartId: string) => {
    setItemAssignments(prev => ({
      ...prev,
      [cartId]: ((prev[cartId] ?? 0) + 1) % PERSON_COLORS.length,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scissors className="h-4 w-4 text-primary" />
            Split Bill
          </DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 mx-4 mt-3 bg-secondary/60 rounded-xl p-1">
          {(["equal", "items"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={[
                "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
                mode === m
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              data-testid={`split-tab-${m}`}
            >
              {m === "equal" ? "Equal Split" : "By Items"}
            </button>
          ))}
        </div>

        {/* ── Equal split ─────────────────────────────────────────────────── */}
        {mode === "equal" ? (
          <div className="px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">How many people?</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEqualPeople(p => Math.max(2, p - 1))}
                  className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="split-people-minus"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xl font-black tabular-nums w-6 text-center">{equalPeople}</span>
                <button
                  onClick={() => setEqualPeople(p => Math.min(10, p + 1))}
                  className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="split-people-plus"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: equalPeople }, (_, i) => {
                const color = PERSON_COLORS[i % PERSON_COLORS.length];
                return (
                  <div key={i} className={["rounded-xl p-3 flex items-center gap-2.5", color.light].join(" ")}>
                    <div className={["w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0", color.bg].join(" ")}>
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Person {i + 1}</div>
                      <div className={["text-sm font-bold tabular-nums", color.text].join(" ")}>
                        {formatCurrency(perPersonEqual, currency)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
              <span>Total</span>
              <span className="font-semibold tabular-nums">{formatCurrency(total, currency)}</span>
            </div>

            <Button
              onClick={() => { onEqualSplitDone(); onClose(); }}
              className="w-full rounded-xl h-10 text-sm font-bold"
              data-testid="split-equal-proceed"
            >
              <Users className="h-4 w-4 mr-1.5" />
              Proceed to Checkout
            </Button>
          </div>

        /* ── By items ────────────────────────────────────────────────────── */
        ) : (
          <div className="px-4 py-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Tap the colored badge on each item to reassign it to a different person.
            </p>

            <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
              {cart.map(item => {
                const pIdx = itemAssignments[item.cartId] ?? 0;
                const color = PERSON_COLORS[pIdx];
                const lineTotal = itemUnitPrice(item) * item.quantity;
                return (
                  <div key={item.cartId} className="flex items-center gap-2.5 py-1.5 border-b border-border/30 last:border-0">
                    <button
                      onClick={() => cycleItem(item.cartId)}
                      className={[
                        "w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 transition-all active:scale-90",
                        color.bg,
                      ].join(" ")}
                      data-testid={`split-assign-${item.cartId}`}
                      title="Tap to reassign"
                    >
                      {color.label}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {item.product.name}{item.size ? ` · ${item.size.name}` : ""}
                      </div>
                      {item.note && (
                        <div className="text-[10px] text-muted-foreground truncate">{item.note}</div>
                      )}
                    </div>
                    <div className="text-xs font-semibold tabular-nums shrink-0 text-muted-foreground">
                      ×{item.quantity}&nbsp;
                      <span className="text-foreground">{formatCurrency(lineTotal, currency)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-person summary */}
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Summary</p>
              {splits.map(s => {
                const color = PERSON_COLORS[s.personIndex];
                return (
                  <div key={s.personIndex} className="flex items-center gap-2">
                    <div className={["w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", color.bg].join(" ")}>
                      {s.personLabel}
                    </div>
                    <span className="text-xs flex-1 text-muted-foreground">
                      {s.items.length} item{s.items.length !== 1 ? "s" : ""}
                    </span>
                    <span className={["text-xs font-bold tabular-nums", color.text].join(" ")}>
                      {formatCurrency(s.total, currency)}
                    </span>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={() => { onItemSplitCharge(splits); onClose(); }}
              disabled={usedPersonCount < 2}
              className="w-full rounded-xl h-10 text-sm font-bold"
              data-testid="split-items-charge"
            >
              <Scissors className="h-4 w-4 mr-1.5" />
              Charge {splits.length} Separate Bills
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
