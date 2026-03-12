import * as fs from "fs";
import * as path from "path";

function loadEnvVars() {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=").trim();
        if (key && value) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnvVars();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const POS_KEYWORDS = ["sales", "order", "product", "menu", "inventory", "revenue", "customer", "payment", "receipt", "transaction", "analytics", "café", "coffee", "pos", "discount", "tax", "delivery", "staff", "shift", "report"];

function isPOSRelated(message: string): boolean {
  const lower = message.toLowerCase();
  return POS_KEYWORDS.some(keyword => lower.includes(keyword)) || lower.length < 3;
}

export interface SalesContext {
  totalRevenue?: number;
  totalOrders?: number;
  recentSales?: any[];
  topProducts?: any[];
  currency?: string;
}

export class AIService {
  async chat(userMessage: string, context?: SalesContext): Promise<string> {
    // Check if the question is POS-related
    if (!isPOSRelated(userMessage)) {
      return "I'm specifically designed to help with café POS operations. Please ask me about sales, orders, products, analytics, or customer service!";
    }

    // Try Gemini first
    if (GEMINI_API_KEY) {
      try {
        return await this.callGemini(userMessage, context);
      } catch (error) {
        console.warn("Gemini failed:", error instanceof Error ? error.message : error);
      }
    }

    // Fallback to Deepseek
    if (DEEPSEEK_API_KEY) {
      try {
        return await this.callDeepseek(userMessage, context);
      } catch (error) {
        console.warn("Deepseek failed:", error instanceof Error ? error.message : error);
      }
    }

    // Final fallback with context awareness
    return this.generateContextualResponse(userMessage, context);
  }

  private generateContextualResponse(message: string, context?: SalesContext): string {
    const lower = message.toLowerCase();
    const currency = context?.currency || "₱";
    
    if (lower.includes("recent") || lower.includes("last") || lower.includes("week") || lower.includes("sale")) {
      if (context?.recentSales && context.recentSales.length > 0) {
        const lastSales = context.recentSales.slice(0, 5);
        const totalFromRecent = lastSales.reduce((sum, s) => sum + (typeof s.total === 'string' ? parseFloat(s.total) : s.total), 0);
        return `Your recent sales summary:\n\n📊 Last ${lastSales.length} transactions: ${currency}${totalFromRecent.toFixed(2)}\n\nTop items sold: ${lastSales.map(s => `${s.items?.[0]?.product?.name || 'Item'}`).join(', ')}\n\nKeep up the great work! 🎉`;
      }
      return "You haven't had any recent sales yet. Start taking orders!";
    }
    
    if (lower.includes("top") || lower.includes("best") || lower.includes("popular")) {
      if (context?.topProducts && context.topProducts.length > 0) {
        const tops = context.topProducts.slice(0, 3).map(p => p.name).join(", ");
        return `Your top products are: ${tops}. These are your bestsellers! 🏆`;
      }
      return "No sales data yet to determine top products.";
    }

    if (lower.includes("revenue") || lower.includes("earnings") || lower.includes("total")) {
      if (context?.totalRevenue) {
        return `Your total revenue is ${currency}${context.totalRevenue.toFixed(2)} from ${context.totalOrders} orders. 💰`;
      }
      return "No sales recorded yet.";
    }

    return "I'm your POS assistant. Ask me about your sales performance, top products, recent orders, or business insights!";
  }

  private async callGemini(userMessage: string, context?: SalesContext): Promise<string> {
    const contextStr = context ? `\n\nCurrent POS Data:\n- Total Revenue: ${context.totalRevenue}\n- Total Orders: ${context.totalOrders}\n- Recent Sales: ${context.recentSales?.length || 0}` : "";
    
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a POS system assistant for Café Bara. ONLY answer questions related to café operations, sales, orders, products, analytics, and customer service. If the question is NOT about POS/café operations, refuse politely and redirect to POS topics.${contextStr}\n\nUser question: ${userMessage}`,
          }],
        }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) throw new Error("No response from Gemini");
    return text;
  }

  private async callDeepseek(userMessage: string, context?: SalesContext): Promise<string> {
    const contextStr = context ? `Current POS Data: ${context.totalRevenue} revenue, ${context.totalOrders} orders` : "";
    
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `You are a POS assistant for Café Bara. ONLY discuss café operations, sales, products, analytics. Refuse non-POS questions. ${contextStr}`,
          },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Deepseek error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) throw new Error("No response from Deepseek");
    return text;
  }

  clearHistory(): void {}
}

export const aiService = new AIService();
