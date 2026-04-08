import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { APP_PAGES } from "@shared/nav-config";
import { useLocation } from "wouter";
import {
  Send, Paperclip, Loader2, Sparkles, Trash2, FileText,
  Plus, MessageSquare, ChevronLeft, Settings, Check, X, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useSettings } from "@/hooks/use-settings";
import {
  initAiStore,
  getSessions, getSession, createSession, updateSession,
  deleteSession, groupSessionsByDate, getFloatEnabled, setFloatEnabled,
  getIconSize, setIconSize, getIconOpacity, setIconOpacity,
  getFloatDraggable, setFloatDraggable,
  type AiSession, type AiMessage,
} from "@/lib/ai-store";

interface ImportPayload {
  products: Array<{ name: string; price: string; category?: string; stock?: number; trackStock?: boolean }>;
}

interface PriceUpdatePayload {
  updates: Array<{ name: string; price: string }>;
}

interface AddProductPayload {
  name: string; price: string; category?: string; stock?: number; trackStock?: boolean;
}

interface ExpensePayload {
  name: string; amount: string; category?: string;
}

interface DiscountPayload {
  code: string; type: "percentage" | "fixed"; value: string;
  minOrder?: string; maxUses?: number | null; expiresAt?: string | null;
}

interface UpdateDiscountPayload {
  code: string; type?: "percentage" | "fixed"; value?: string;
  minOrder?: string; maxUses?: number | null; expiresAt?: string | null;
}

interface DeleteDiscountPayload {
  code: string;
}

interface ToggleDiscountPayload {
  code: string; isActive: boolean;
}

interface StaffInfoPayload {
  branch?: string;
}

function extractTagJson(content: string, tag: string): { json: string | null; stripped: string } {
  const openTag = `[${tag}]`;
  // Strip markdown code fences that the AI might wrap around the tag
  const cleaned = content.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");

  // Try with closing tag first
  const withClose = new RegExp(
    `\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`,
    "i"
  );
  const m = cleaned.match(withClose);
  if (m) {
    const stripped = cleaned.replace(withClose, "").trim();
    return { json: m[1].trim(), stripped };
  }

  // Fallback: no closing tag — grab everything from [TAG] to end of string
  const idx = cleaned.indexOf(openTag);
  if (idx !== -1) {
    const json = cleaned.slice(idx + openTag.length).trim();
    const stripped = cleaned.slice(0, idx).trim();
    return { json, stripped };
  }

  return { json: null, stripped: content };
}

// Strip markdown bold/italic markers that the AI may accidentally include in values
function stripMd(s: string): string {
  return s.replace(/\*\*|__|\*|_/g, "").trim();
}

function parseImportAction(content: string): {
  display: string;
  importPayload: ImportPayload | null;
  pricePayload: PriceUpdatePayload | null;
  addProductPayload: AddProductPayload | null;
  expensePayload: ExpensePayload | null;
  discountPayload: DiscountPayload | null;
  updateDiscountPayload: UpdateDiscountPayload | null;
  deleteDiscountPayload: DeleteDiscountPayload | null;
  toggleDiscountPayload: ToggleDiscountPayload | null;
  staffInfoPayload: StaffInfoPayload | null;
  followups: string[];
} {
  let display = content;
  let importPayload: ImportPayload | null = null;
  let pricePayload: PriceUpdatePayload | null = null;
  let addProductPayload: AddProductPayload | null = null;
  let expensePayload: ExpensePayload | null = null;
  let discountPayload: DiscountPayload | null = null;
  let updateDiscountPayload: UpdateDiscountPayload | null = null;
  let deleteDiscountPayload: DeleteDiscountPayload | null = null;
  let toggleDiscountPayload: ToggleDiscountPayload | null = null;
  let staffInfoPayload: StaffInfoPayload | null = null;
  let followups: string[] = [];

  const tags: Array<{ tag: string; setter: (v: string) => void }> = [
    { tag: "IMPORT_PRODUCTS", setter: v => { try { importPayload = JSON.parse(v); } catch {} } },
    { tag: "UPDATE_PRICES", setter: v => { try { pricePayload = JSON.parse(v); } catch {} } },
    { tag: "ADD_PRODUCT", setter: v => { try { addProductPayload = JSON.parse(v); } catch {} } },
    { tag: "LOG_EXPENSE", setter: v => { try { expensePayload = JSON.parse(v); } catch {} } },
    { tag: "CREATE_DISCOUNT_CODE", setter: v => { try { const p = JSON.parse(v); if (p?.code) p.code = stripMd(p.code); discountPayload = p; } catch {} } },
    { tag: "UPDATE_DISCOUNT_CODE", setter: v => { try { const p = JSON.parse(v); if (p?.code) p.code = stripMd(p.code); updateDiscountPayload = p; } catch {} } },
    { tag: "DELETE_DISCOUNT_CODE", setter: v => { try { const p = JSON.parse(v); if (p?.code) p.code = stripMd(p.code); deleteDiscountPayload = p; } catch {} } },
    { tag: "TOGGLE_DISCOUNT_CODE", setter: v => { try { const p = JSON.parse(v); if (p?.code) p.code = stripMd(p.code); toggleDiscountPayload = p; } catch {} } },
  ];

  for (const { tag, setter } of tags) {
    const { json, stripped } = extractTagJson(display, tag);
    if (json !== null) {
      if (json) setter(json);
      display = stripped;
    }
  }

  // SHOW_STAFF_INFO: trigger card even if JSON is empty
  const { json: staffJson, stripped: afterStaff } = extractTagJson(display, "SHOW_STAFF_INFO");
  if (staffJson !== null) {
    try { staffInfoPayload = staffJson ? JSON.parse(staffJson) : {}; } catch { staffInfoPayload = {}; }
    display = afterStaff;
  }

  const { json: followupJson, stripped: afterFollowup } = extractTagJson(display, "FOLLOWUP");
  if (followupJson !== null) {
    if (followupJson) followups = followupJson.split("|").map(s => s.trim()).filter(Boolean);
    display = afterFollowup;
  }

  return { display, importPayload, pricePayload, addProductPayload, expensePayload, discountPayload, updateDiscountPayload, deleteDiscountPayload, toggleDiscountPayload, staffInfoPayload, followups };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Dynamically built from shared/nav-config.ts — add pages there, not here
const PAGE_LINK_MAP: Record<string, string> = {
  // Generated from APP_PAGES (label → url)
  ...Object.fromEntries(
    APP_PAGES.map(p => [p.label.split(" / ")[0], p.url])
  ),
  // Aliases the AI commonly uses that differ from the label
  "Pending": "/pending",
  "Pending Orders": "/pending",
  "Bookings": "/appointments",
  "Discount Codes": "/discount-codes",
  "Discounts": "/discount-codes",
  "Time Clock": "/timeclock",
  "Rooms": "/rooms",
  "Branches": "/admin/branches",
  "Admin": "/admin",
  "AI": "/ai",
};

// Build a regex alternation of page names, longest first to avoid partial matches
const PAGE_NAMES_RE = new RegExp(
  `\\*\\*(.+?)\\*\\*|\`([^\`]+)\`|\\b(${
    Object.keys(PAGE_LINK_MAP)
      .sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")
  })\\b`,
  "g"
);

function renderMarkdown(text: string, isUser: boolean, navigate?: (to: string) => void): ReactNode {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;

  function renderInline(str: string): ReactNode[] {
    const parts: ReactNode[] = [];
    const re = navigate ? new RegExp(PAGE_NAMES_RE.source, "g") : /\*\*(.+?)\*\*|`([^`]+)`/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) parts.push(str.slice(last, m.index));
      if (m[1] !== undefined) {
        // **bold** — also link if it's a known page name
        const route = navigate && PAGE_LINK_MAP[m[1]];
        if (route) {
          parts.push(
            <strong
              key={m.index}
              className="font-semibold text-primary underline decoration-dotted cursor-pointer"
              onClick={() => navigate(route)}
            >{m[1]}</strong>
          );
        } else {
          parts.push(<strong key={m.index} className="font-semibold">{m[1]}</strong>);
        }
      } else if (m[2] !== undefined) {
        // `code`
        parts.push(
          <code key={m.index} className="px-1 py-0.5 rounded bg-muted/80 dark:bg-white/10 font-mono text-[11px] text-foreground">
            {m[2]}
          </code>
        );
      } else if (m[3] !== undefined && navigate) {
        // Plain page name mention → link it
        const route = PAGE_LINK_MAP[m[3]];
        parts.push(
          <span
            key={m.index}
            className="text-primary font-medium underline decoration-dotted cursor-pointer"
            onClick={() => navigate(route)}
          >{m[3]}</span>
        );
      }
      last = m.index + m[0].length;
    }
    if (last < str.length) parts.push(str.slice(last));
    return parts;
  }

  // Matches lines like "| A | B | C |" (standard) or "A | B | C" (no border pipes)
  function isTableRow(line: string) {
    const t = line.trim();
    if (t.startsWith("|") && t.endsWith("|")) return true;
    // Detect implicit tables: 2+ pipe separators with surrounding text
    const parts = t.split("|");
    return parts.length >= 3 && parts.every(p => p.length < 60);
  }

  function isSeparatorRow(line: string) {
    const t = line.trim();
    return /^\|[\s\-:|]+\|$/.test(t) || /^[\-:]+(\s*\|\s*[\-:]+)+$/.test(t);
  }

  function parseTableRow(line: string): string[] {
    const t = line.trim();
    if (t.startsWith("|") && t.endsWith("|")) {
      return t.slice(1, -1).split("|").map(c => c.trim());
    }
    return t.split("|").map(c => c.trim());
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    if (trimmed === "") {
      nodes.push(<div key={`gap-${i}`} className="h-2" />);
      i++;
      continue;
    }

    if (trimmed.startsWith("[DEBUG]")) {
      const detail = trimmed.slice(7).trim();
      nodes.push(
        <div key={i} className="mt-1 px-2 py-1 rounded bg-muted/80 border border-border/60 font-mono text-[10px] text-muted-foreground break-all leading-snug">
          {detail}
        </div>
      );
      i++;
      continue;
    }

    // Markdown table — collect all pipe-delimited rows
    if (isTableRow(trimmed)) {
      const tableStart = i;
      const rawRows: string[][] = [];
      let headerRow: string[] | null = null;
      let hasSeparator = false;

      while (i < lines.length && (isTableRow(lines[i].trim()) || isSeparatorRow(lines[i].trim()))) {
        const row = lines[i].trim();
        if (isSeparatorRow(row)) {
          hasSeparator = true;
          if (rawRows.length > 0 && !headerRow) {
            headerRow = rawRows.pop()!;
          }
        } else {
          rawRows.push(parseTableRow(row));
        }
        i++;
      }

      // If no explicit separator, treat first row as header
      if (!hasSeparator && rawRows.length > 1) {
        headerRow = rawRows.shift()!;
      }

      nodes.push(
        <div key={tableStart} className="w-full overflow-x-auto my-1 rounded-xl border border-border/60">
          <table className="w-full text-xs border-collapse">
            {headerRow && (
              <thead>
                <tr className="bg-muted/60 dark:bg-white/[0.06]">
                  {headerRow.map((cell, ci) => (
                    <th key={ci} className="px-3 py-2 text-left font-semibold text-foreground border-b border-border/60 whitespace-nowrap">
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rawRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "" : "bg-muted/30 dark:bg-white/[0.03]"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-foreground/90 border-b border-border/40 last:border-b-0 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings: ## Heading or # Heading
    if (/^#{1,3} /.test(trimmed)) {
      const level = (trimmed.match(/^#+/) || [""])[0].length;
      const content = trimmed.slice(level + 1);
      const sizeClass = level === 1 ? "text-base font-bold" : level === 2 ? "text-sm font-bold" : "text-sm font-semibold";
      nodes.push(
        <div key={i} className={`mt-3 first:mt-0 ${sizeClass} text-foreground`}>
          {renderInline(content)}
        </div>
      );
      i++;
      continue;
    }

    // Numbered list: "1. Item"
    if (/^\d+\. /.test(trimmed)) {
      const num = (trimmed.match(/^(\d+)\./) || [])[1];
      const content = trimmed.replace(/^\d+\. /, "");
      nodes.push(
        <div key={i} className="flex gap-2 items-start" style={{ paddingLeft: indent > 0 ? `${indent * 6}px` : undefined }}>
          <span className="mt-[3px] shrink-0 text-primary/70 text-xs font-semibold min-w-[14px]">{num}.</span>
          <span>{renderInline(content)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Legacy numbered heading: #1. Item
    if (/^#\d+\./.test(trimmed)) {
      nodes.push(
        <div key={i} className="mt-3 first:mt-0 font-semibold text-foreground">
          {renderInline(trimmed)}
        </div>
      );
      i++;
      continue;
    }

    if (/^[•\-\*] /.test(trimmed)) {
      const content = trimmed.slice(2);
      nodes.push(
        <div key={i} className="flex gap-2 items-start" style={{ paddingLeft: indent > 0 ? `${indent * 6}px` : undefined }}>
          <span className="mt-[3px] shrink-0 text-primary/70 text-xs">•</span>
          <span>{renderInline(content)}</span>
        </div>
      );
      i++;
      continue;
    }

    if (indent >= 2) {
      nodes.push(
        <div key={i} className="text-muted-foreground text-xs leading-relaxed" style={{ paddingLeft: `${Math.min(indent, 6) * 5}px` }}>
          {renderInline(trimmed)}
        </div>
      );
      i++;
      continue;
    }

    nodes.push(
      <div key={i} className="leading-relaxed">
        {renderInline(trimmed)}
      </div>
    );
    i++;
  }

  return <div className={`space-y-[2px] text-sm ${isUser ? "" : ""}`}>{nodes}</div>;
}

function TypingCursor() {
  return (
    <span
      className="inline-block w-[2px] h-[14px] bg-primary ml-0.5 align-middle rounded-full"
      style={{ animation: "ai-cursor-blink 0.8s step-end infinite" }}
    />
  );
}

function StaffInfoCard({ branch }: { branch?: string; onAction: (p: StaffInfoPayload) => void }) {
  const [staffData, setStaffData] = useState<{ staff: any[]; branches: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch("/api/ai/staff-info", { credentials: "include" })
      .then(r => r.json())
      .then(d => { setStaffData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filteredStaff = staffData?.staff.filter(s => {
    if (!branch || branch === "all") return true;
    return s.branchNames?.some((bn: string) => bn.toLowerCase().includes(branch.toLowerCase()));
  }) ?? [];

  const handleBan = async (userId: string, currentBanned: boolean) => {
    setActionLoading(userId);
    try {
      await fetch(`/api/admin/users/${userId}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ban: !currentBanned }),
      });
      setActionResults(prev => ({ ...prev, [userId]: currentBanned ? "Access restored" : "Access revoked" }));
      setStaffData(prev => prev ? {
        ...prev,
        staff: prev.staff.map(s => s.id === userId ? { ...s, isBanned: !currentBanned } : s),
      } : prev);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } catch {
      setActionResults(prev => ({ ...prev, [userId]: "Action failed" }));
    } finally {
      setActionLoading(null);
    }
  };

  const roleColor: Record<string, string> = {
    owner: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400",
    manager: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
    admin: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
    cashier: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-700/50 rounded-xl p-3 w-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Staff {branch && branch !== "all" ? `— ${branch}` : "(All Branches)"}
        </p>
        <span className="text-[10px] text-muted-foreground">{filteredStaff.length} member{filteredStaff.length !== 1 ? "s" : ""}</span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading staff…
        </div>
      ) : filteredStaff.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No staff found{branch && branch !== "all" ? ` for "${branch}"` : ""}.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {filteredStaff.map((s: any) => (
            <div key={s.id} className={`rounded-lg border p-2 ${s.isBanned ? "border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-foreground truncate">{s.name || "Unnamed"}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${roleColor[s.role] || "bg-muted text-muted-foreground"}`}>{s.role}</span>
                    {s.isBanned && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 font-medium">BANNED</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{s.email || "No email"}</p>
                  {s.branchNames?.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {s.branchNames.join(", ")}
                    </p>
                  )}
                </div>
                {s.role !== "owner" && (
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {actionResults[s.id] ? (
                      <span className="text-[10px] text-muted-foreground">{actionResults[s.id]}</span>
                    ) : (
                      <button
                        onClick={() => handleBan(s.id, s.isBanned)}
                        disabled={actionLoading === s.id}
                        className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-colors ${
                          s.isBanned
                            ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/60"
                            : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60"
                        }`}
                      >
                        {actionLoading === s.id ? "…" : s.isBanned ? "Restore" : "Revoke"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground mt-2">Go to Admin → Users to manage branch assignments and roles.</p>
    </div>
  );
}

function MessageBubble({
  msg, onImport, onUpdatePrices, onAddProduct, onLogExpense, onCreateDiscount,
  onUpdateDiscount, onDeleteDiscount, onToggleDiscount, onShowStaffInfo,
  isStreaming, importDone, priceDone, addProductDone, expenseDone, discountDone,
  updateDiscountDone, deleteDiscountDone, toggleDiscountDone,
  onMarkImported, onMarkPriceUpdated, onMarkAddProduct, onMarkExpense, onMarkDiscount,
  onMarkUpdateDiscount, onMarkDeleteDiscount, onMarkToggleDiscount,
  onFollowup,
}: {
  msg: AiMessage;
  onImport: (p: ImportPayload) => void;
  onUpdatePrices: (p: PriceUpdatePayload) => void;
  onAddProduct: (p: AddProductPayload) => void;
  onLogExpense: (p: ExpensePayload) => void;
  onCreateDiscount: (p: DiscountPayload) => void;
  onUpdateDiscount: (p: UpdateDiscountPayload) => void;
  onDeleteDiscount: (p: DeleteDiscountPayload) => void;
  onToggleDiscount: (p: ToggleDiscountPayload) => void;
  onShowStaffInfo: (p: StaffInfoPayload) => void;
  isStreaming?: boolean;
  importDone: boolean;
  priceDone: boolean;
  addProductDone: boolean;
  expenseDone: boolean;
  discountDone: boolean;
  updateDiscountDone: boolean;
  deleteDiscountDone: boolean;
  toggleDiscountDone: boolean;
  onMarkImported: () => void;
  onMarkPriceUpdated: () => void;
  onMarkAddProduct: () => void;
  onMarkExpense: () => void;
  onMarkDiscount: () => void;
  onMarkUpdateDiscount: () => void;
  onMarkDeleteDiscount: () => void;
  onMarkToggleDiscount: () => void;
  onFollowup: (q: string) => void;
}) {
  const isUser = msg.role === "user";
  const [, navigate] = useLocation();

  // Follow-up button clicks are sent silently — don't show a user bubble for them
  if (isUser && msg.silent) return null;

  const { display, importPayload: payload, pricePayload, addProductPayload, expensePayload, discountPayload, updateDiscountPayload, deleteDiscountPayload, toggleDiscountPayload, staffInfoPayload, followups } = parseImportAction(msg.content);
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmPrice, setConfirmPrice] = useState(false);
  const [confirmAddProduct, setConfirmAddProduct] = useState(false);
  const [confirmExpense, setConfirmExpense] = useState(false);
  const [confirmDiscount, setConfirmDiscount] = useState(false);
  const [confirmUpdateDiscount, setConfirmUpdateDiscount] = useState(false);
  const [confirmDeleteDiscount, setConfirmDeleteDiscount] = useState(false);
  const [confirmToggleDiscount, setConfirmToggleDiscount] = useState(false);
  // Tracks locally executed actions to disable buttons immediately on first click
  const [executedActions, setExecutedActions] = useState<Set<string>>(new Set());
  const markExecuted = (action: string) => setExecutedActions(prev => new Set(prev).add(action));

  // If the entire message was just an action card (no display text) and the action is done,
  // remove the whole bubble (including the AI avatar) to avoid an empty orphaned message.
  const actionIsDone =
    (payload && payload.products?.length > 0 && importDone) ||
    (pricePayload && pricePayload.updates?.length > 0 && priceDone) ||
    (addProductPayload && addProductPayload.name && addProductDone) ||
    (expensePayload && expensePayload.name && expenseDone) ||
    (discountPayload && discountPayload.code && discountDone) ||
    (updateDiscountPayload && updateDiscountPayload.code && updateDiscountDone) ||
    (deleteDiscountPayload && deleteDiscountPayload.code && deleteDiscountDone) ||
    (toggleDiscountPayload && toggleDiscountPayload.code && toggleDiscountDone);

  if (!isUser && !display.trim() && actionIsDone) {
    return null;
  }

  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
      )}
      <div className={`max-w-[78%] flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        {msg.file && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-muted/50 border border-border/60 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate max-w-[160px]">{msg.file.name}</span>
            <span className="shrink-0 opacity-70">({formatBytes(msg.file.size)})</span>
          </div>
        )}
        {(display.trim() || isStreaming) && (
          <div
            className={[
              "px-4 py-2.5 text-sm leading-relaxed",
              isUser
                ? "bg-primary text-white rounded-[20px] rounded-tr-[5px] whitespace-pre-wrap shadow-sm"
                : "bg-muted/50 dark:bg-white/[0.07] text-foreground rounded-[20px] rounded-tl-[5px]",
            ].join(" ")}
          >
            {isUser ? display : (
              <span>
                {renderMarkdown(display, isUser, isUser ? undefined : navigate)}
                {isStreaming && <TypingCursor />}
              </span>
            )}
          </div>
        )}
        {payload && payload.products?.length > 0 && !importDone && (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50 rounded-xl p-3 w-full">
            <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2">
              {payload.products.length} product{payload.products.length !== 1 ? "s" : ""} ready to import
            </p>
            <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto">
              {payload.products.slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs gap-2">
                  <span className="truncate text-green-800 dark:text-green-300">{p.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
                        {p.category}
                      </span>
                    )}
                    <span className="font-semibold text-green-800 dark:text-green-300">₱{p.price}</span>
                    {p.stock !== undefined && (
                      <span className="text-[10px] text-green-600 dark:text-green-500">
                        stock: {p.stock}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {payload.products.length > 8 && (
                <p className="text-xs text-green-600 dark:text-green-500 pt-1">+{payload.products.length - 8} more products…</p>
              )}
            </div>
            {!confirmImport ? (
              <Button
                size="sm"
                onClick={() => setConfirmImport(true)}
                className="w-full h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
              >
                Import All {payload.products.length} Products
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-green-700 dark:text-green-400 font-medium text-center">
                  Add {payload.products.length} product{payload.products.length !== 1 ? "s" : ""} to your store?
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={executedActions.has("import")}
                    onClick={() => { markExecuted("import"); onMarkImported(); setConfirmImport(false); onImport(payload); }}
                    className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white disabled:opacity-60"
                  >
                    <Check className="h-3 w-3 mr-1" /> Yes, import
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmImport(false)}
                    className="flex-1 h-8 text-xs border-green-300 text-green-700 dark:text-green-400"
                  >
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {pricePayload && pricePayload.updates?.length > 0 && !priceDone && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-3 w-full">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2">
              {pricePayload.updates.length} price update{pricePayload.updates.length !== 1 ? "s" : ""} ready
            </p>
            <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto">
              {pricePayload.updates.slice(0, 8).map((u, i) => (
                <div key={i} className="flex items-center justify-between text-xs gap-2">
                  <span className="truncate text-blue-800 dark:text-blue-300">{u.name}</span>
                  <span className="font-semibold text-blue-800 dark:text-blue-300 shrink-0">→ ₱{u.price}</span>
                </div>
              ))}
              {pricePayload.updates.length > 8 && (
                <p className="text-xs text-blue-600 dark:text-blue-500 pt-1">+{pricePayload.updates.length - 8} more…</p>
              )}
            </div>
            {!confirmPrice ? (
              <Button
                size="sm"
                onClick={() => setConfirmPrice(true)}
                className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                Apply {pricePayload.updates.length} Price Updates
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-blue-700 dark:text-blue-400 font-medium text-center">
                  Update prices for {pricePayload.updates.length} product{pricePayload.updates.length !== 1 ? "s" : ""}?
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={executedActions.has("price")}
                    onClick={() => { markExecuted("price"); onMarkPriceUpdated(); setConfirmPrice(false); onUpdatePrices(pricePayload); }}
                    className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                  >
                    <Check className="h-3 w-3 mr-1" /> Yes, update
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmPrice(false)}
                    className="flex-1 h-8 text-xs border-blue-300 text-blue-700 dark:text-blue-400"
                  >
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {addProductPayload && addProductPayload.name && !addProductDone && (
          <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 rounded-xl p-3 w-full">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-2">New product ready to add</p>
            <div className="space-y-1 mb-3">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-medium text-purple-800 dark:text-purple-300">{addProductPayload.name}</span>
                <span className="font-semibold text-purple-800 dark:text-purple-300 shrink-0">₱{addProductPayload.price}</span>
              </div>
              {addProductPayload.category && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">
                  {addProductPayload.category}
                </span>
              )}
            </div>
            {!confirmAddProduct ? (
              <Button size="sm" onClick={() => setConfirmAddProduct(true)} className="w-full h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white">
                Add Product
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-purple-700 dark:text-purple-400 font-medium text-center">Add "{addProductPayload.name}" to your store?</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={executedActions.has("addProduct")} onClick={() => { markExecuted("addProduct"); onMarkAddProduct(); setConfirmAddProduct(false); onAddProduct(addProductPayload); }} className="flex-1 h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-60">
                    <Check className="h-3 w-3 mr-1" /> Yes, add it
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmAddProduct(false)} className="flex-1 h-8 text-xs border-purple-300 text-purple-700 dark:text-purple-400">
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {expensePayload && expensePayload.name && !expenseDone && (
          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 rounded-xl p-3 w-full">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-2">Expense ready to log</p>
            <div className="space-y-1 mb-3">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-medium text-orange-800 dark:text-orange-300">{expensePayload.name}</span>
                <span className="font-semibold text-orange-800 dark:text-orange-300 shrink-0">₱{expensePayload.amount}</span>
              </div>
              {expensePayload.category && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400">
                  {expensePayload.category}
                </span>
              )}
            </div>
            {!confirmExpense ? (
              <Button size="sm" onClick={() => setConfirmExpense(true)} className="w-full h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white">
                Log Expense
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-orange-700 dark:text-orange-400 font-medium text-center">Log ₱{expensePayload.amount} for "{expensePayload.name}"?</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={executedActions.has("expense")} onClick={() => { markExecuted("expense"); onMarkExpense(); setConfirmExpense(false); onLogExpense(expensePayload); }} className="flex-1 h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-60">
                    <Check className="h-3 w-3 mr-1" /> Yes, log it
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmExpense(false)} className="flex-1 h-8 text-xs border-orange-300 text-orange-700 dark:text-orange-400">
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {discountPayload && discountPayload.code && !discountDone && (
          <div className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/50 rounded-xl p-3 w-full">
            <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 mb-2">Discount code ready to create</p>
            <div className="space-y-1 mb-3">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-mono font-bold text-cyan-800 dark:text-cyan-300 text-sm">{discountPayload.code}</span>
                <span className="font-semibold text-cyan-800 dark:text-cyan-300 shrink-0">
                  {discountPayload.type === "percentage" ? `${discountPayload.value}% off` : `₱${discountPayload.value} off`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {discountPayload.minOrder && parseFloat(discountPayload.minOrder) > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400">
                    Min order ₱{discountPayload.minOrder}
                  </span>
                )}
                {discountPayload.maxUses && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400">
                    Max {discountPayload.maxUses} uses
                  </span>
                )}
                {discountPayload.expiresAt && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400">
                    Expires {discountPayload.expiresAt}
                  </span>
                )}
              </div>
            </div>
            {!confirmDiscount ? (
              <Button size="sm" onClick={() => setConfirmDiscount(true)} className="w-full h-8 text-xs bg-cyan-600 hover:bg-cyan-700 text-white">
                Create Discount Code
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-cyan-700 dark:text-cyan-400 font-medium text-center">Create code "{discountPayload.code}"?</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={executedActions.has("discount")} onClick={() => { markExecuted("discount"); onMarkDiscount(); setConfirmDiscount(false); onCreateDiscount(discountPayload); }} className="flex-1 h-8 text-xs bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-60">
                    <Check className="h-3 w-3 mr-1" /> Yes, create it
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDiscount(false)} className="flex-1 h-8 text-xs border-cyan-300 text-cyan-700 dark:text-cyan-400">
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {updateDiscountPayload && updateDiscountPayload.code && !updateDiscountDone && (
          <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 rounded-xl p-3 w-full">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 mb-2">Update discount code</p>
            <div className="space-y-1 mb-3">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-mono font-bold text-indigo-800 dark:text-indigo-300 text-sm">{updateDiscountPayload.code}</span>
                {updateDiscountPayload.value && (
                  <span className="font-semibold text-indigo-800 dark:text-indigo-300 shrink-0">
                    {updateDiscountPayload.type === "percentage" ? `${updateDiscountPayload.value}% off` : `₱${updateDiscountPayload.value} off`}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {updateDiscountPayload.maxUses != null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400">
                    Max {updateDiscountPayload.maxUses} uses
                  </span>
                )}
                {updateDiscountPayload.expiresAt && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400">
                    Expires {updateDiscountPayload.expiresAt}
                  </span>
                )}
                {updateDiscountPayload.minOrder && parseFloat(updateDiscountPayload.minOrder) > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400">
                    Min order ₱{updateDiscountPayload.minOrder}
                  </span>
                )}
              </div>
            </div>
            {!confirmUpdateDiscount ? (
              <Button size="sm" onClick={() => setConfirmUpdateDiscount(true)} className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white">
                Update Discount Code
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-indigo-700 dark:text-indigo-400 font-medium text-center">Apply changes to "{updateDiscountPayload.code}"?</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={executedActions.has("updateDiscount")} onClick={() => { markExecuted("updateDiscount"); onMarkUpdateDiscount(); setConfirmUpdateDiscount(false); onUpdateDiscount(updateDiscountPayload); }} className="flex-1 h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60">
                    <Check className="h-3 w-3 mr-1" /> Yes, update
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmUpdateDiscount(false)} className="flex-1 h-8 text-xs border-indigo-300 text-indigo-700 dark:text-indigo-400">
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {deleteDiscountPayload && deleteDiscountPayload.code && !deleteDiscountDone && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl p-3 w-full">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">Delete discount code</p>
            <div className="flex items-center justify-between text-xs gap-2 mb-3">
              <span className="font-mono font-bold text-red-800 dark:text-red-300 text-sm">{deleteDiscountPayload.code}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">Permanent</span>
            </div>
            {!confirmDeleteDiscount ? (
              <Button size="sm" onClick={() => setConfirmDeleteDiscount(true)} className="w-full h-8 text-xs bg-red-600 hover:bg-red-700 text-white">
                Delete Discount Code
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-red-700 dark:text-red-400 font-medium text-center">Permanently delete "{deleteDiscountPayload.code}"?</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={executedActions.has("deleteDiscount")} onClick={() => { markExecuted("deleteDiscount"); onMarkDeleteDiscount(); setConfirmDeleteDiscount(false); onDeleteDiscount(deleteDiscountPayload); }} className="flex-1 h-8 text-xs bg-red-600 hover:bg-red-700 text-white disabled:opacity-60">
                    <Check className="h-3 w-3 mr-1" /> Yes, delete
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDeleteDiscount(false)} className="flex-1 h-8 text-xs border-red-300 text-red-700 dark:text-red-400">
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {toggleDiscountPayload && toggleDiscountPayload.code && !toggleDiscountDone && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 w-full">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
              {toggleDiscountPayload.isActive ? "Activate" : "Deactivate"} discount code
            </p>
            <div className="flex items-center justify-between text-xs gap-2 mb-3">
              <span className="font-mono font-bold text-amber-800 dark:text-amber-300 text-sm">{toggleDiscountPayload.code}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${toggleDiscountPayload.isActive ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"}`}>
                → {toggleDiscountPayload.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            {!confirmToggleDiscount ? (
              <Button size="sm" onClick={() => setConfirmToggleDiscount(true)} className="w-full h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white">
                {toggleDiscountPayload.isActive ? "Activate" : "Deactivate"} Code
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium text-center">
                  {toggleDiscountPayload.isActive ? "Activate" : "Deactivate"} "{toggleDiscountPayload.code}"?
                </p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={executedActions.has("toggleDiscount")} onClick={() => { markExecuted("toggleDiscount"); onMarkToggleDiscount(); setConfirmToggleDiscount(false); onToggleDiscount(toggleDiscountPayload); }} className="flex-1 h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-60">
                    <Check className="h-3 w-3 mr-1" /> Yes
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmToggleDiscount(false)} className="flex-1 h-8 text-xs border-amber-300 text-amber-700 dark:text-amber-400">
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {staffInfoPayload !== null && (
          <StaffInfoCard branch={staffInfoPayload.branch} onAction={onShowStaffInfo} />
        )}
        {!isUser && !isStreaming && followups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 mt-0.5">
            {followups.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowup(q)}
                className="text-[11px] px-3 py-1.5 rounded-full bg-primary/8 border border-primary/20 text-primary hover:bg-primary/15 hover:border-primary/40 transition-colors font-medium"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <span className={`text-[10px] text-muted-foreground/40 px-1 ${isUser ? "text-right" : ""}`}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

function getSuggestionGroups(businessType?: string | null, businessSubType?: string | null) {
  const salesGroup = {
    label: "Sales & Revenue",
    emoji: "📊",
    items: ["Show me this month's revenue vs last month", "Which item sells the most?"],
  };
  const staffGroup = {
    label: "Staff & Branches",
    emoji: "👥",
    items: ["Show me all staff emails", "Who has access to main branch?"],
  };
  const discountsGroup = {
    label: "Discounts",
    emoji: "🏷️",
    items: ["Create 10% off discount code SAVE10", "Show me all my discount codes"],
  };

  let middleGroup: { label: string; emoji: string; items: string[] };

  if (businessType === "food_beverage") {
    const sub = businessSubType;
    if (sub === "cafe") {
      middleGroup = { label: "Menu & Stock", emoji: "☕", items: ["Anong menu item ang mababa ang stock?", "Add Iced Matcha ₱140 Drinks"] };
    } else if (sub === "restaurant") {
      middleGroup = { label: "Menu & Stock", emoji: "🍽️", items: ["Anong menu item ang mababa ang stock?", "Add Grilled Liempo ₱220 Mains"] };
    } else if (sub === "bakery") {
      middleGroup = { label: "Menu & Stock", emoji: "🥐", items: ["Anong tinapay ang mababa ang stock?", "Add Ube Ensaymada ₱55 Pastries"] };
    } else if (sub === "bar") {
      middleGroup = { label: "Menu & Stock", emoji: "🍺", items: ["Anong drinks ang mababa ang stock?", "Add San Miguel Light ₱70 Beers"] };
    } else if (sub === "food_truck") {
      middleGroup = { label: "Menu & Stock", emoji: "🚚", items: ["Anong menu item ang mababa ang stock?", "Add BBQ Skewer ₱50 Grills"] };
    } else {
      middleGroup = { label: "Menu & Stock", emoji: "📦", items: ["Anong menu item ang mababa ang stock?", "Add Iced Matcha ₱140 Drinks"] };
    }
  } else if (businessType === "retail") {
    const sub = businessSubType;
    if (sub === "clothing") {
      middleGroup = { label: "Items & Stock", emoji: "👗", items: ["Anong item ang mababa ang stock?", "Add White Oversized Tee ₱599 Tops"] };
    } else if (sub === "electronics") {
      middleGroup = { label: "Products & Stock", emoji: "📱", items: ["Anong gadget ang mababa ang stock?", "Add USB-C Hub ₱799 Accessories"] };
    } else if (sub === "grocery") {
      middleGroup = { label: "Products & Stock", emoji: "🛒", items: ["Anong grocery item ang mababa ang stock?", "Add Coca-Cola 1.5L ₱75 Beverages"] };
    } else if (sub === "bookstore") {
      middleGroup = { label: "Books & Stock", emoji: "📚", items: ["Anong libro ang mababa ang stock?", "Add Atomic Habits ₱499 Self-Help"] };
    } else {
      middleGroup = { label: "Products & Stock", emoji: "📦", items: ["Anong produkto ang mababa ang stock?", "Add New Product ₱299 General"] };
    }
  } else if (businessType === "services") {
    const sub = businessSubType;
    if (sub === "salon") {
      middleGroup = { label: "Services & Availability", emoji: "✂️", items: ["Who is available today?", "Add Haircut with Blow Dry ₱350 Haircuts"] };
    } else if (sub === "gym") {
      middleGroup = { label: "Memberships & Plans", emoji: "💪", items: ["Show expiring memberships this month", "Add 1-Month Gym Plan ₱999 Monthly"] };
    } else if (sub === "spa") {
      middleGroup = { label: "Treatments & Bookings", emoji: "🧖", items: ["Which treatment is booked the most?", "Add Hot Stone Massage ₱800 Treatments"] };
    } else if (sub === "clinic") {
      middleGroup = { label: "Appointments & Services", emoji: "🏥", items: ["Show appointments today", "Add Dental Cleaning ₱500 Dental"] };
    } else if (sub === "laundry") {
      middleGroup = { label: "Services & Orders", emoji: "👕", items: ["Show pending laundry orders today", "Add Express Wash ₱150 Services"] };
    } else if (sub === "pet_grooming") {
      middleGroup = { label: "Services & Pets", emoji: "🐾", items: ["Show appointments today", "Add Full Groom Package ₱600 Grooming"] };
    } else if (sub === "car_wash") {
      middleGroup = { label: "Services & Bookings", emoji: "🚗", items: ["Show today's car wash bookings", "Add Full Detail ₱1500 Detailing"] };
    } else {
      middleGroup = { label: "Services & Bookings", emoji: "📋", items: ["Who is available today?", "Add New Service ₱500 Services"] };
    }
  } else {
    middleGroup = { label: "Products & Stock", emoji: "📦", items: ["Anong produkto ang mababa ang stock?", "Add New Item ₱299 General"] };
  }

  return [salesGroup, staffGroup, middleGroup, discountsGroup];
}

function EmptyState({
  onSuggestion,
  onDailyDigest,
  businessType,
  businessSubType,
}: {
  onSuggestion: (s: string) => void;
  onDailyDigest: () => void;
  businessType?: string | null;
  businessSubType?: string | null;
}) {
  const groups = getSuggestionGroups(businessType, businessSubType);
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center gap-5">
      <div className="flex flex-col items-center gap-3">
        <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Hey, I'm your AI</h2>
          <p className="text-sm text-muted-foreground max-w-[240px] mt-0.5">
            Ask me anything about your store — sales, staff, stock, discounts.
          </p>
        </div>
      </div>

      <button
        onClick={onDailyDigest}
        className="w-full max-w-sm flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-colors text-left group"
      >
        <span className="text-2xl">☀️</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Daily Business Digest</p>
          <p className="text-xs text-muted-foreground">Sales, stock, customers — morning briefing</p>
        </div>
        <Send className="h-3.5 w-3.5 text-primary/50 group-hover:text-primary/80 transition-colors" />
      </button>

      <div className="w-full max-w-sm space-y-3">
        {groups.map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5 px-1">
              {group.emoji} {group.label}
            </p>
            <div className="flex flex-col gap-1.5">
              {group.items.map(s => (
                <button
                  key={s}
                  onClick={() => onSuggestion(s)}
                  className="text-sm px-3.5 py-2.5 rounded-2xl bg-muted/40 border border-border/60 text-left text-foreground hover:bg-muted/70 hover:border-primary/20 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


export default function AiPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();
  const { data: settings } = useSettings();
  const businessType = (settings as any)?.businessType as string | null | undefined;
  const businessSubType = (settings as any)?.businessSubType as string | null | undefined;

  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Persists import/price-update done state across page navigation (MessageBubble unmounts/remounts)
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [priceUpdatedIds, setPriceUpdatedIds] = useState<Set<string>>(new Set());
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ name: string; size: number } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [loggingExpense, setLoggingExpense] = useState(false);
  const [creatingDiscount, setCreatingDiscount] = useState(false);
  const [addProductDoneIds, setAddProductDoneIds] = useState<Set<string>>(new Set());
  const [expenseDoneIds, setExpenseDoneIds] = useState<Set<string>>(new Set());
  const [discountDoneIds, setDiscountDoneIds] = useState<Set<string>>(new Set());
  const [updateDiscountDoneIds, setUpdateDiscountDoneIds] = useState<Set<string>>(new Set());
  const [deleteDiscountDoneIds, setDeleteDiscountDoneIds] = useState<Set<string>>(new Set());
  const [toggleDiscountDoneIds, setToggleDiscountDoneIds] = useState<Set<string>>(new Set());
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [floatEnabled, setFloatEnabledState] = useState(() => getFloatEnabled());
  const [iconSize, setIconSizeState] = useState(() => getIconSize());
  const [iconOpacity, setIconOpacityState] = useState(() => getIconOpacity());
  const [floatDraggable, setFloatDraggableState] = useState(() => getFloatDraggable());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize AI store with the current user's ID for data isolation
  useEffect(() => {
    if (user?.id) {
      initAiStore(user.id);
      setSessions(getSessions());
    }
  }, [user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshSessions = () => setSessions(getSessions());

  const openSession = (id: string) => {
    const s = getSession(id);
    if (!s) return;
    setActiveId(id);
    setMessages(s.messages);
    setShowSidebar(false);
    setShowSettings(false);
  };

  const startNewChat = () => {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setFileContent(null);
    setPendingFile(null);
    setShowSidebar(false);
    setShowSettings(false);
    textareaRef.current?.focus();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
  };

  const confirmDelete = (id: string) => {
    deleteSession(id);
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    refreshSessions();
    setDeletingId(null);
  };

  const toggleFloat = (val: boolean) => {
    setFloatEnabled(val);
    setFloatEnabledState(val);
  };

  const handleIconSize = (val: number) => {
    setIconSize(val);
    setIconSizeState(val);
  };

  const handleIconOpacity = (val: number) => {
    setIconOpacity(val);
    setIconOpacityState(val);
  };

  const handleDraggableToggle = (val: boolean) => {
    setFloatDraggable(val);
    setFloatDraggableState(val);
  };

  const sendMessage = useCallback(async (text?: string, options?: { silent?: boolean }) => {
    const content = (text ?? input).trim();
    if (!content && !pendingFile) return;
    if (loading) return;
    if (!isOnline) {
      return;
    }

    let sessionId = activeId;
    if (!sessionId) {
      const s = createSession();
      sessionId = s.id;
      setActiveId(s.id);
    }

    const userMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: content || `Uploaded: ${pendingFile?.name}`,
      timestamp: new Date().toISOString(),
      file: pendingFile ?? undefined,
      ...(options?.silent ? { silent: true } : {}),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const history = newMessages.slice(-20).map(m => ({
      role: m.role,
      // Strip [DEBUG] lines before sending to AI — they're for the user only
      content: m.content.replace(/\n\n\[DEBUG\][^\n]*/g, "").trim(),
    }));
    if (!content && pendingFile) {
      history[history.length - 1].content = `I uploaded "${pendingFile.name}". Please analyze it.`;
    }

    const fc = fileContent;
    setFileContent(null);
    setPendingFile(null);

    const assistantId = crypto.randomUUID();
    const assistantMsg: AiMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };

    setMessages([...newMessages, assistantMsg]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: history, fileContent: fc ?? undefined }),
      });

      if (!res.ok || !res.body) {
        let errMsg = "Something went wrong. Please try again.";
        let errDebug = `HTTP ${res.status}`;
        try {
          const d = await res.json();
          errMsg = d.message ?? errMsg;
          if (d.debug) errDebug += ` — ${d.debug}`;
        } catch {}
        const fullErr = `${errMsg}\n\n[DEBUG] ${errDebug}`;
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: fullErr } : m
        ));
        updateSession(sessionId!, [...newMessages, { ...assistantMsg, content: fullErr }]);
        refreshSessions();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      const flush = (full: string) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: full } : m
        ));
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.type === "chunk" && parsed.content) {
              accumulated += parsed.content;
              flush(accumulated);
            } else if (parsed.type === "override" && parsed.content) {
              accumulated = parsed.content;
              flush(accumulated);
            } else if (parsed.type === "error") {
              const errMsg = parsed.message ?? "Something went wrong. Please try again.";
              const debugLine = parsed.debug ? `\n\n[DEBUG] ${parsed.debug}` : "";
              accumulated = errMsg + debugLine;
              flush(accumulated);
            } else if (parsed.type === "account_banned") {
              // Force logout after a short delay so the user sees the ban message
              setTimeout(async () => {
                try { await fetch("/auth/logout", { method: "POST", credentials: "include" }); } catch {}
                queryClient.setQueryData(["auth-me"], null);
                queryClient.clear();
                window.location.href = "/login?reason=banned";
              }, 2500);
            }
          } catch {}
        }
      }

      const finalContent = accumulated || "Sorry, I couldn't get a response.";
      const finalMsg = { ...assistantMsg, content: finalContent };
      const finalMessages = [...newMessages, finalMsg];
      setMessages(finalMessages);
      updateSession(sessionId!, finalMessages);
      refreshSessions();

    } catch (err: any) {
      const errContent = navigator.onLine
        ? "The connection was interrupted. Please try again."
        : "You appear to be offline. Please check your connection.";
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: errContent } : m
      ));
      updateSession(sessionId!, [...newMessages, { ...assistantMsg, content: errContent }]);
      refreshSessions();
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, pendingFile, fileContent, activeId, isOnline]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/upload", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      const data = await res.json();
      setFileContent(data.content);
      setPendingFile({ name: file.name, size: file.size });
      // Auto-prompt for product import if it looks like a product file
      const lowerName = file.name.toLowerCase();
      if (lowerName.includes("product") || lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        setInput("Please analyze this file and import the products.");
      }
      textareaRef.current?.focus();
    } catch (err: any) {
      const errMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Failed to read file: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleImport = async (payload: ImportPayload) => {
    setImporting(true);
    try {
      const res = await apiRequest("POST", "/api/ai/import-products", payload);
      const data = await res.json();
      const resultMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Done! Successfully imported ${data.imported} product${data.imported !== 1 ? "s" : ""} into your system.${data.errors?.length ? `\n\nSome items were skipped:\n${data.errors.slice(0, 3).join("\n")}` : ""}`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...messages, resultMsg];
      setMessages(finalMessages);
      if (activeId) updateSession(activeId, finalMessages);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    } catch {
      const errMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Failed to import products. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setImporting(false);
    }
  };

  const handleUpdatePrices = async (payload: PriceUpdatePayload) => {
    setUpdatingPrices(true);
    try {
      const res = await apiRequest("POST", "/api/ai/update-prices", payload);
      const data = await res.json();
      const resultMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Done! Updated prices for **${data.updated}** product${data.updated !== 1 ? "s" : ""}.${data.notFound > 0 ? `\n\n${data.notFound} product${data.notFound !== 1 ? "s" : ""} not matched: ${data.notFoundList?.slice(0, 3).join(", ")}` : ""}`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...messages, resultMsg];
      setMessages(finalMessages);
      if (activeId) updateSession(activeId, finalMessages);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    } catch {
      const errMsg: AiMessage = { id: crypto.randomUUID(), role: "assistant", content: "Failed to update prices. Please try again.", timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setUpdatingPrices(false);
    }
  };

  const handleAddProduct = async (payload: AddProductPayload) => {
    setAddingProduct(true);
    try {
      const res = await apiRequest("POST", "/api/ai/add-product", payload);
      const data = await res.json();
      const resultMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Done! **${data.product?.name}** has been added to your store at ₱${data.product?.price}.`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...messages, resultMsg];
      setMessages(finalMessages);
      if (activeId) updateSession(activeId, finalMessages);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    } catch (err: any) {
      const body = await err.json?.().catch(() => null);
      const errMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: body?.message || "Failed to add product. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setAddingProduct(false);
    }
  };

  const handleLogExpense = async (payload: ExpensePayload) => {
    setLoggingExpense(true);
    try {
      const res = await apiRequest("POST", "/api/ai/log-expense", payload);
      const data = await res.json();
      const resultMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Done! Expense logged — **${data.expense?.description}** for ₱${data.expense?.amount} under **${data.expense?.category}**.`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...messages, resultMsg];
      setMessages(finalMessages);
      if (activeId) updateSession(activeId, finalMessages);
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    } catch {
      const errMsg: AiMessage = { id: crypto.randomUUID(), role: "assistant", content: "Failed to log expense. Please try again.", timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoggingExpense(false);
    }
  };

  const handleCreateDiscount = async (payload: DiscountPayload) => {
    setCreatingDiscount(true);
    try {
      const res = await apiRequest("POST", "/api/ai/create-discount", payload);
      const data = await res.json();
      const d = data.discount;
      const resultMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Done! Discount code **${d?.code}** created — ${d?.type === "percentage" ? `${d?.value}% off` : `₱${d?.value} off`}. It's now active and ready to use at the POS.`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...messages, resultMsg];
      setMessages(finalMessages);
      if (activeId) updateSession(activeId, finalMessages);
      queryClient.invalidateQueries({ queryKey: ["/api/discount-codes"] });
    } catch {
      const errMsg: AiMessage = { id: crypto.randomUUID(), role: "assistant", content: "Failed to create discount code. Please try again.", timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setCreatingDiscount(false);
    }
  };

  const handleUpdateDiscount = async (payload: UpdateDiscountPayload) => {
    try {
      const res = await apiRequest("POST", "/api/ai/update-discount", payload);
      const data = await res.json();
      const d = data.discount;
      const resultMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Done! Discount code **${d?.code}** has been updated — ${d?.type === "percentage" ? `${d?.value}% off` : `₱${d?.value} off`}.`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...messages, resultMsg];
      setMessages(finalMessages);
      if (activeId) updateSession(activeId, finalMessages);
      queryClient.invalidateQueries({ queryKey: ["/api/discount-codes"] });
    } catch (err: any) {
      const body = await err.json?.().catch(() => null);
      const errMsg: AiMessage = { id: crypto.randomUUID(), role: "assistant", content: body?.message || "Failed to update discount code.", timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    }
  };

  const handleDeleteDiscount = async (payload: DeleteDiscountPayload) => {
    try {
      const res = await apiRequest("POST", "/api/ai/delete-discount", payload);
      const data = await res.json();
      const resultMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Done! Discount code **${data.code}** has been permanently deleted.`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...messages, resultMsg];
      setMessages(finalMessages);
      if (activeId) updateSession(activeId, finalMessages);
      queryClient.invalidateQueries({ queryKey: ["/api/discount-codes"] });
    } catch (err: any) {
      const body = await err.json?.().catch(() => null);
      const errMsg: AiMessage = { id: crypto.randomUUID(), role: "assistant", content: body?.message || "Failed to delete discount code.", timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    }
  };

  const handleToggleDiscount = async (payload: ToggleDiscountPayload) => {
    try {
      const res = await apiRequest("POST", "/api/ai/toggle-discount", payload);
      const data = await res.json();
      const d = data.discount;
      const resultMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Done! Discount code **${d?.code}** is now **${d?.isActive ? "active" : "inactive"}**.`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...messages, resultMsg];
      setMessages(finalMessages);
      if (activeId) updateSession(activeId, finalMessages);
      queryClient.invalidateQueries({ queryKey: ["/api/discount-codes"] });
    } catch (err: any) {
      const body = await err.json?.().catch(() => null);
      const errMsg: AiMessage = { id: crypto.randomUUID(), role: "assistant", content: body?.message || "Failed to toggle discount code.", timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    }
  };

  const handleShowStaffInfo = (_payload: StaffInfoPayload) => {
    // Staff info is rendered inline in the StaffInfoCard component — no action needed here
  };

  const handleDailyDigest = () => {
    sendMessage("Give me my daily business digest — today's sales, low stock alerts, inactive customers, and one key insight.");
  };

  const handleSaveGoal = async () => {
    const parsed = parseFloat(goalInput.replace(/,/g, ""));
    if (isNaN(parsed) || parsed <= 0) return;
    setSavingGoal(true);
    try {
      await apiRequest("POST", "/api/ai/goal", { goal: String(parsed) });
      const confirmMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Monthly revenue goal set to **₱${parsed.toLocaleString("en-PH", { minimumFractionDigits: 2 })}**! I'll track your progress towards it.`,
        timestamp: new Date().toISOString(),
      };
      const s = createSession();
      setActiveId(s.id);
      const newMsgs = [confirmMsg];
      setMessages(newMsgs);
      updateSession(s.id, newMsgs);
      refreshSessions();
      setShowSidebar(false);
      setGoalInput("");
    } catch {
      // silently fail
    } finally {
      setSavingGoal(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const grouped = groupSessionsByDate(sessions);

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const sidebar = (
    <div className="flex flex-col h-full w-full bg-card border-r border-border">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-3 w-3 text-white" />
          </div>
          <p className="text-sm font-bold truncate">ArtixPOS AI</p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-1.5 rounded-lg hover:bg-muted/60 transition-colors ${showSettings ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        {/* Desktop only: back to home */}
        <button
          onClick={() => setLocation("/")}
          className="hidden md:flex p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
          title="Back to dashboard"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {/* Mobile only: close sidebar → return to chat */}
        <button
          onClick={() => setShowSidebar(false)}
          className="md:hidden p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
          title="Back to chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-border bg-muted/20 space-y-4 shrink-0">
          {/* Float toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">Floating button</p>
              <p className="text-[11px] text-muted-foreground">Quick-access sparkle button</p>
            </div>
            <button
              data-testid="toggle-float-button"
              onClick={() => toggleFloat(!floatEnabled)}
              role="switch"
              aria-checked={floatEnabled}
              className={[
                "relative inline-flex w-10 h-6 rounded-full transition-colors duration-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                floatEnabled ? "bg-primary" : "bg-muted-foreground/30",
              ].join(" ")}
            >
              <span
                className={[
                  "pointer-events-none absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                  floatEnabled ? "translate-x-5" : "translate-x-1",
                ].join(" ")}
              />
            </button>
          </div>

          {/* Icon size slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Icon size</p>
              <span className="text-[11px] text-muted-foreground">{iconSize}px</span>
            </div>
            <input
              data-testid="slider-icon-size"
              type="range"
              min={36}
              max={80}
              step={2}
              value={iconSize}
              onChange={e => handleIconSize(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-muted-foreground/20 accent-primary cursor-pointer"
            />
          </div>

          {/* Icon transparency slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Icon transparency</p>
              <span className="text-[11px] text-muted-foreground">{100 - iconOpacity}%</span>
            </div>
            <input
              data-testid="slider-icon-opacity"
              type="range"
              min={20}
              max={100}
              step={5}
              value={iconOpacity}
              onChange={e => handleIconOpacity(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-muted-foreground/20 accent-primary cursor-pointer"
            />
          </div>

          {/* Draggable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">Draggable button</p>
              <p className="text-[11px] text-muted-foreground">Move the button anywhere on screen</p>
            </div>
            <button
              data-testid="toggle-float-draggable"
              onClick={() => handleDraggableToggle(!floatDraggable)}
              role="switch"
              aria-checked={floatDraggable}
              className={[
                "relative inline-flex w-10 h-6 rounded-full transition-colors duration-200 shrink-0",
                floatDraggable ? "bg-primary" : "bg-muted-foreground/30",
              ].join(" ")}
            >
              <span className={[
                "pointer-events-none absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                floatDraggable ? "translate-x-5" : "translate-x-1",
              ].join(" ")} />
            </button>
          </div>

          {/* Monthly revenue goal */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">Monthly revenue goal</p>
            <p className="text-[11px] text-muted-foreground">AI will track progress toward this target</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₱</span>
                <input
                  data-testid="input-revenue-goal"
                  type="number"
                  min={0}
                  placeholder="e.g. 50000"
                  value={goalInput}
                  onChange={e => setGoalInput(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <button
                data-testid="button-save-goal"
                onClick={handleSaveGoal}
                disabled={savingGoal || !goalInput}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
              >
                {savingGoal ? "Saving…" : "Set"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sessions list — min-h-0 ensures it can shrink and scroll properly */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <MessageSquare className="h-6 w-6 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">No chats yet. Tap below to start!</p>
          </div>
        ) : (
          Object.entries(grouped).map(([label, group]) => (
            <div key={label} className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-2 py-1">{label}</p>
              {group.map(session => (
                <div key={session.id} className="relative group">
                  {deletingId === session.id ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
                      <p className="text-xs text-destructive flex-1 font-medium">Delete this chat?</p>
                      <button onClick={() => confirmDelete(session.id)} className="text-destructive hover:text-destructive/80 p-0.5">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeletingId(null)} className="text-muted-foreground hover:text-foreground p-0.5">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => openSession(session.id)}
                      className={[
                        "w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors",
                        activeId === session.id
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-foreground hover:bg-muted/60 border border-transparent",
                      ].join(" ")}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
                      <span className="text-xs truncate flex-1">{session.title}</span>
                      {/* Delete button: always visible on touch, hover on desktop */}
                      <button
                        onClick={(e) => handleDelete(session.id, e)}
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded-lg hover:bg-destructive/10 shrink-0 -mr-1"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* New chat button — pinned at bottom, always visible */}
      <div className="p-3 border-t border-border shrink-0">
        <button
          data-testid="button-new-chat"
          onClick={startNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all shadow-sm"
        >
          <Plus className="h-4 w-4 shrink-0" />
          New Chat
        </button>
      </div>
    </div>
  );

  // ── Chat area ──────────────────────────────────────────────────────────────
  const chatArea = (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat header — visible on all screen sizes */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60 shrink-0 bg-card/80 backdrop-blur-sm">
        {/* Mobile: back to sidebar button */}
        <button
          onClick={() => setShowSidebar(true)}
          className="md:hidden text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/60 transition-colors"
          title="Chat history"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="hidden md:flex h-6 w-6 rounded-full bg-primary items-center justify-center shrink-0">
            <Sparkles className="h-3 w-3 text-white" />
          </div>
          <p className="text-sm font-semibold truncate text-foreground">
            {activeId ? (getSession(activeId)?.title ?? "ArtixPOS AI") : "ArtixPOS AI"}
          </p>
        </div>
        {/* New Chat button — always visible in the chat header */}
        <button
          data-testid="button-new-chat-header"
          onClick={startNewChat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 hover:border-primary/40 active:scale-95 transition-all shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New Chat</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-5 space-y-3">
        {messages.length === 0 ? (
          <EmptyState onSuggestion={sendMessage} onDailyDigest={handleDailyDigest} businessType={businessType} businessSubType={businessSubType} />
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onImport={handleImport}
              onUpdatePrices={handleUpdatePrices}
              onAddProduct={handleAddProduct}
              onLogExpense={handleLogExpense}
              onCreateDiscount={handleCreateDiscount}
              onUpdateDiscount={handleUpdateDiscount}
              onDeleteDiscount={handleDeleteDiscount}
              onToggleDiscount={handleToggleDiscount}
              onShowStaffInfo={handleShowStaffInfo}
              isStreaming={loading && idx === messages.length - 1 && msg.role === "assistant" && msg.content.length > 0}
              importDone={importedIds.has(msg.id)}
              priceDone={priceUpdatedIds.has(msg.id)}
              addProductDone={addProductDoneIds.has(msg.id)}
              expenseDone={expenseDoneIds.has(msg.id)}
              discountDone={discountDoneIds.has(msg.id)}
              updateDiscountDone={updateDiscountDoneIds.has(msg.id)}
              deleteDiscountDone={deleteDiscountDoneIds.has(msg.id)}
              toggleDiscountDone={toggleDiscountDoneIds.has(msg.id)}
              onMarkImported={() => setImportedIds(prev => new Set(prev).add(msg.id))}
              onMarkPriceUpdated={() => setPriceUpdatedIds(prev => new Set(prev).add(msg.id))}
              onMarkAddProduct={() => setAddProductDoneIds(prev => new Set(prev).add(msg.id))}
              onMarkExpense={() => setExpenseDoneIds(prev => new Set(prev).add(msg.id))}
              onMarkDiscount={() => setDiscountDoneIds(prev => new Set(prev).add(msg.id))}
              onMarkUpdateDiscount={() => setUpdateDiscountDoneIds(prev => new Set(prev).add(msg.id))}
              onMarkDeleteDiscount={() => setDeleteDiscountDoneIds(prev => new Set(prev).add(msg.id))}
              onMarkToggleDiscount={() => setToggleDiscountDoneIds(prev => new Set(prev).add(msg.id))}
              onFollowup={(q) => sendMessage(q, { silent: true })}
            />
          ))
        )}

        {/* Thinking dots — only when waiting for first token */}
        {loading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-2 justify-start">
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="px-4 py-3 rounded-[20px] rounded-tl-[5px] bg-muted/50 dark:bg-white/[0.07]">
              <div className="flex gap-1.5 items-center h-4">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 md:px-8 pb-4 pt-2 shrink-0">
        <div className="max-w-3xl mx-auto">
          {!isOnline && (
            <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">You're offline. Chat history is available but new messages require a connection.</span>
            </div>
          )}
          {pendingFile && (
            <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-xl bg-primary/8 border border-primary/20 text-xs text-primary">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1 font-medium">{pendingFile.name}</span>
              <button onClick={() => { setPendingFile(null); setFileContent(null); }} className="text-primary/60 hover:text-primary shrink-0 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className={["flex items-end gap-1.5 bg-muted/40 dark:bg-white/[0.05] border border-border rounded-[24px] px-2 py-2 focus-within:border-primary/40 focus-within:bg-muted/60 transition-all", !isOnline ? "opacity-50 pointer-events-none" : ""].join(" ")}>
            <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile || loading || !isOnline}
              className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              title="Upload PDF or Excel"
            >
              {uploadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={!isOnline ? "Offline — reconnect to send messages" : pendingFile ? "Ask about this file…" : "Ask anything about your store…"}
              rows={1}
              disabled={loading || !isOnline}
              className="flex-1 resize-none bg-transparent border-none outline-none px-1 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 disabled:opacity-60 min-h-[36px] max-h-[120px]"
              style={{ height: "36px" }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = "36px";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || (!input.trim() && !pendingFile) || !isOnline}
              className={[
                "h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition-all",
                (loading || (!input.trim() && !pendingFile))
                  ? "bg-muted text-muted-foreground/40"
                  : "bg-primary text-white shadow-sm hover:bg-primary/90 active:scale-95",
              ].join(" ")}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-center text-muted-foreground/30 mt-1.5">
            AI can make mistakes. Always verify important data.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes ai-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
      <div className="h-[calc(100dvh-56px)] flex overflow-hidden -mx-4 md:-mx-6 -my-5">
        {/* Desktop: always show sidebar */}
        <div className="hidden md:flex w-64 shrink-0 h-full overflow-hidden flex-col">
          {sidebar}
        </div>

        {/* Mobile: sidebar OR chat */}
        <div className="flex md:hidden w-full h-full overflow-hidden">
          {showSidebar ? sidebar : chatArea}
        </div>

        {/* Desktop: chat area */}
        <div className="hidden md:flex flex-1 min-w-0 h-full overflow-hidden bg-background">
          {chatArea}
        </div>
      </div>
    </>
  );
}
