import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requirePro } from "../middleware";
import { insertExpenseSchema } from "@shared/schema";
import { z } from "zod";
import { getUserId, getActiveBranchId, resolveBranchId, auditLog, handleZodError } from "../lib/route-utils";

export function registerExpenseRoutes(app: Express): void {

  app.get("/api/expenses", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getExpenses(getUserId(req), {
      branchId: getActiveBranchId(req),
      limit: 500,
    });
    res.json(list);
  });

  app.post("/api/expenses", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertExpenseSchema.extend({ amount: z.coerce.string() }).parse(req.body);
      const branchId = await resolveBranchId(req);
      const expense = await storage.createExpense(getUserId(req), { ...input, branchId });
      await auditLog(req, "create", "expense", String(expense.id), {
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
      });
      res.status(201).json(expense);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.put("/api/expenses/:id", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertExpenseSchema.partial().extend({ amount: z.coerce.string().optional() }).parse(req.body);
      const expense = await storage.updateExpense(Number(req.params.id), getUserId(req), input);
      if (!expense) return res.status(404).json({ message: "Expense not found" });
      await auditLog(req, "update", "expense", String(expense.id), {
        description: expense.description,
        amount: expense.amount,
      });
      res.json(expense);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.delete("/api/expenses/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const id       = Number(req.params.id);
      const uid      = getUserId(req);
      const existing = await storage.getExpenseById(id, uid);
      await storage.deleteExpense(id, getUserId(req));
      await auditLog(req, "delete", "expense", String(id), {
        description: existing?.description,
        amount:      existing?.amount,
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });
}
