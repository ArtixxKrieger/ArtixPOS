import * as fs from "fs";
import * as path from "path";

// Load env vars directly in this file to ensure they're available
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

console.log("AI Service loaded. Gemini available:", !!GEMINI_API_KEY, "Deepseek available:", !!DEEPSEEK_API_KEY);

const FALLBACK_RESPONSES: Record<string, string> = {
  "product": "For your Café Bara, I recommend featuring your specialty lattes and seasonal drinks. Focus on high-margin items and create bundles with snacks.",
  "sales": "To boost sales, try running a lunch special on coffee combos or create a loyalty program. Peak hours are typically 8-10 AM and 12-1 PM.",
  "order": "Your order system is tracking all transactions efficiently. Keep an eye on high-demand items and restock accordingly.",
  "analytics": "Monitor your top-selling products and adjust inventory. Track customer preferences to identify opportunities for new menu items.",
  "default": "I'm your café POS assistant. Ask me about product recommendations, sales strategies, analytics insights, or order management tips!"
};

function selectFallbackResponse(message: string): string {
  const lower = message.toLowerCase();
  for (const [key, response] of Object.entries(FALLBACK_RESPONSES)) {
    if (key !== "default" && lower.includes(key)) {
      return response;
    }
  }
  return FALLBACK_RESPONSES.default;
}

export class AIService {
  async chat(userMessage: string): Promise<string> {
    // Try Gemini first
    if (GEMINI_API_KEY) {
      try {
        return await this.callGemini(userMessage);
      } catch (error) {
        console.warn("Gemini failed:", error instanceof Error ? error.message : error);
      }
    }

    // Fallback to Deepseek
    if (DEEPSEEK_API_KEY) {
      try {
        return await this.callDeepseek(userMessage);
      } catch (error) {
        console.warn("Deepseek failed:", error instanceof Error ? error.message : error);
      }
    }

    // Final fallback: Use smart response selection
    console.log("Using fallback response for:", userMessage);
    return selectFallbackResponse(userMessage);
  }

  private async callGemini(userMessage: string): Promise<string> {
    // Try the correct API endpoint for Gemini
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: userMessage,
          }],
        }],
        safetySettings: [
          { category: "HARM_CATEGORY_UNSPECIFIED", threshold: "BLOCK_NONE" },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error("No response from Gemini");
    }

    return text;
  }

  private async callDeepseek(userMessage: string): Promise<string> {
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
            content: "You are a helpful POS assistant for Café Bara. Provide concise, practical advice.",
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Deepseek error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) {
      throw new Error("No response from Deepseek");
    }

    return text;
  }

  clearHistory(): void {
    // Stateless
  }
}

export const aiService = new AIService();
