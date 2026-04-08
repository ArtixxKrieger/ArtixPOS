import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { insertExpenseSchema, type Expense } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Plus, Trash2, TrendingDown, Calendar, ChevronDown } from "lucide-react";

const EXPENSE_CATEGORIES = ["General", "Supplies", "Utilities", "Rent", "Salaries", "Marketing", "Maintenance", "Food & Drinks", "Transportation", "Other"];

const formSchema = insertExpenseSchema.extend({
  amount: z.coerce.string().min(1, "Amount is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
});

function ExpenseForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { category: "General", description: "", amount: "" },
  });
  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) => apiRequest("POST", "/api/expenses", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Expense recorded" });
      onSuccess();
    },
    onError: () => toast({ title: "Error saving expense" }),
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
        <FormField control={form.control} name="category" render={({ field }) => (
          <FormItem>
            <FormLabel>Category *</FormLabel>
            <FormControl>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-10 rounded-xl" data-testid="select-expense-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description *</FormLabel>
            <FormControl>
              <Input {...field} placeholder="What was this expense for?" data-testid="input-expense-description" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="amount" render={({ field }) => (
          <FormItem>
            <FormLabel>Amount *</FormLabel>
            <FormControl>
              <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-expense-amount" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={mutation.isPending} data-testid="button-save-expense">
            {mutation.isPending ? "Saving..." : "Record Expense"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

type DateFilter = "all" | "today" | "week" | "month";

export default function Expenses() {
  const { data: expenses = [], isLoading } = useQuery<Expense[]>({ queryKey: ["/api/expenses"] });
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const currency = (settings as any)?.currency || "₱";

  const [showForm, setShowForm] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Expense deleted" });
    },
  });

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      const d = new Date(e.createdAt!);
      const matchDate = dateFilter === "all" ? true
        : dateFilter === "today" ? isToday(d)
        : dateFilter === "week" ? isThisWeek(d, { weekStartsOn: 1 })
        : isThisMonth(d);
      const matchCat = categoryFilter === "all" || e.category === categoryFilter;
      return matchDate && matchCat;
    });
  }, [expenses, dateFilter, categoryFilter]);

  const totalFiltered = filtered.reduce((acc, e) => acc + parseNumeric(e.amount), 0);
  const todayTotal = expenses.filter(e => isToday(new Date(e.createdAt!))).reduce((acc, e) => acc + parseNumeric(e.amount), 0);

  const categories = useMemo(() => {
    const cats = new Set(expenses.map(e => e.category));
    return ["all", ...Array.from(cats)];
  }, [expenses]);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map(i => <div key={i} className="h-20 skeleton-shimmer rounded-2xl" />)}
        </div>
        <div className="h-96 skeleton-shimmer rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 page-enter">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-rose-500/8 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Today</p>
          </div>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">{formatCurrency(todayTotal, currency)}</p>
        </div>
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-orange-500/8 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Wallet className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Filtered Total</p>
          </div>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">{formatCurrency(totalFiltered, currency)}</p>
        </div>
      </div>

      {/* Filters + Add */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Date filter */}
        <div className="relative">
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value as DateFilter)}
            className="h-9 pl-3 pr-7 rounded-xl border border-border bg-background text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="select-date-filter"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>

        {/* Category filter */}
        <div className="relative">
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="h-9 pl-3 pr-7 rounded-xl border border-border bg-background text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="select-category-filter"
          >
            {categories.map(c => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>

        <div className="flex-1" />
        <Button onClick={() => setShowForm(true)} className="h-9 rounded-xl" data-testid="button-add-expense">
          <Plus className="h-4 w-4 mr-1" /> Add Expense
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl py-20 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center mb-2">
            <Wallet className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="font-semibold">No expenses found</p>
          <p className="text-sm text-muted-foreground/70">Track your business expenses here</p>
          <Button onClick={() => setShowForm(true)} variant="outline" className="mt-2">
            <Plus className="h-4 w-4 mr-1" /> Record Expense
          </Button>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="divide-y divide-border/40">
            {filtered.map(expense => (
              <div
                key={expense.id}
                data-testid={`expense-row-${expense.id}`}
                className="flex items-center gap-3 px-4 py-3.5"
              >
                <div className="h-9 w-9 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{expense.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-medium bg-secondary px-2 py-0.5 rounded-full">{expense.category}</span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(expense.createdAt!), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">{formatCurrency(expense.amount, currency)}</p>
                  <button
                    onClick={() => deleteMutation.mutate(expense.id)}
                    disabled={deleteMutation.isPending}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/8 transition-all"
                    data-testid={`button-delete-expense-${expense.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
          <ExpenseForm onSuccess={() => setShowForm(false)} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
