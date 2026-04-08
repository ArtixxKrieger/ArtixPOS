import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";

interface ReceiptItem {
  product: { name: string };
  quantity: number;
  size?: { name: string; price: string };
  modifiers?: { name: string; price: string }[];
  note?: string;
}

export interface ReceiptData {
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  discount: number;
  loyaltyDiscount: number;
  total: number;
  paymentMethod: string;
  paymentAmount: number;
  changeAmount: number;
  customerName?: string;
  storeName?: string;
  receiptFooter?: string;
  currency: string;
  discountCode?: string | null;
  loyaltyPointsEarned?: number;
}

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  receipt: ReceiptData | null;
}

export function ReceiptModal({ open, onClose, receipt }: ReceiptModalProps) {
  if (!receipt) return null;

  const { currency } = receipt;
  const now = new Date();

  const handlePrint = () => {
    const printContent = document.getElementById("receipt-printable");
    if (!printContent) return;
    const win = window.open("", "_blank", "width=320,height=600");
    if (!win) { alert("Please allow pop-ups to print receipts."); return; }
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; padding: 12px; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .line { border-top: 1px dashed #000; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; margin: 2px 0; }
            .item-name { flex: 1; margin-right: 8px; }
            .total-row { font-weight: bold; font-size: 14px; }
            .footer { text-align: center; margin-top: 8px; font-size: 11px; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <script>window.onload = function() { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const isCash = receipt.paymentMethod === "cash";
  const hasDiscount = receipt.discount > 0;
  const hasLoyalty = receipt.loyaltyDiscount > 0;
  const hasTax = receipt.tax > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 flex flex-row items-center justify-between">
          <DialogTitle className="text-base font-bold">Receipt</DialogTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="px-5 pb-5 max-h-[70vh] overflow-y-auto scrollbar-hide">
          <div id="receipt-printable" className="font-mono text-xs space-y-1">
            {/* Store Header */}
            <div className="center text-center mb-3">
              {receipt.storeName && (
                <p className="bold font-bold text-sm">{receipt.storeName}</p>
              )}
              <p className="text-muted-foreground text-[10px]">{format(now, "MMM d, yyyy h:mm a")}</p>
              {receipt.customerName && (
                <p className="text-[10px] mt-0.5">Customer: {receipt.customerName}</p>
              )}
            </div>

            <div className="border-t border-dashed border-border/60 my-2" />

            {/* Items */}
            <div className="space-y-1.5">
              {receipt.items.map((item, i) => {
                const basePrice = parseFloat(item.size?.price || "0");
                const modsTotal = (item.modifiers || []).reduce((s, m) => s + parseFloat(m.price || "0"), 0);
                return (
                  <div key={i}>
                    <div className="flex justify-between">
                      <span className="flex-1 mr-2 font-medium text-[11px]">
                        {item.product.name}
                        {item.size && <span className="text-muted-foreground"> ({item.size.name})</span>}
                        {" "}x{item.quantity}
                      </span>
                      <span className="tabular-nums text-[11px]">
                        {formatCurrency((basePrice + modsTotal) * item.quantity, currency)}
                      </span>
                    </div>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="pl-3 text-muted-foreground text-[10px]">
                        {item.modifiers.map(m => `+ ${m.name}`).join(", ")}
                      </div>
                    )}
                    {item.note && (
                      <div className="pl-3 text-muted-foreground text-[10px] italic">Note: {item.note}</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-dashed border-border/60 my-2" />

            {/* Totals */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(receipt.subtotal, currency)}</span>
              </div>
              {hasDiscount && (
                <div className="flex justify-between text-[11px] text-rose-500">
                  <span>Discount {receipt.discountCode ? `(${receipt.discountCode})` : ""}</span>
                  <span className="tabular-nums">-{formatCurrency(receipt.discount, currency)}</span>
                </div>
              )}
              {hasTax && (
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">{formatCurrency(receipt.tax, currency)}</span>
                </div>
              )}
              {hasLoyalty && (
                <div className="flex justify-between text-[11px] text-amber-600">
                  <span>Loyalty Redemption</span>
                  <span className="tabular-nums">-{formatCurrency(receipt.loyaltyDiscount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-dashed border-border/60">
                <span>TOTAL</span>
                <span className="tabular-nums">{formatCurrency(receipt.total, currency)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Payment ({receipt.paymentMethod.toUpperCase()})</span>
                <span className="tabular-nums">{formatCurrency(receipt.paymentAmount, currency)}</span>
              </div>
              {isCash && receipt.changeAmount > 0 && (
                <div className="flex justify-between text-[11px] text-emerald-600 font-semibold">
                  <span>Change</span>
                  <span className="tabular-nums">{formatCurrency(receipt.changeAmount, currency)}</span>
                </div>
              )}
              {receipt.loyaltyPointsEarned != null && receipt.loyaltyPointsEarned > 0 && (
                <div className="text-[10px] text-amber-600 text-center mt-1">
                  +{receipt.loyaltyPointsEarned} loyalty points earned
                </div>
              )}
            </div>

            {receipt.receiptFooter && (
              <>
                <div className="border-t border-dashed border-border/60 my-2" />
                <p className="text-center text-[10px] text-muted-foreground">{receipt.receiptFooter}</p>
              </>
            )}
            <p className="text-center text-[10px] text-muted-foreground/50 mt-2">Thank you!</p>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl h-10"
            onClick={onClose}
          >
            Close
          </Button>
          <Button
            className="flex-1 rounded-xl h-10 font-bold"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
