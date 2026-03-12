const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class AIService {
  private conversationHistory: ChatMessage[] = [];

  async chat(userMessage: string): Promise<string> {
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    try {
      // Try Gemini first
      if (GEMINI_API_KEY) {
        return await this.callGemini(userMessage);
      }
    } catch (error) {
      console.warn("Gemini API failed, falling back to Deepseek", error);
    }

    // Fallback to Deepseek
    if (DEEPSEEK_API_KEY) {
      return await this.callDeepseek(userMessage);
    }

    throw new Error(
      "No AI service available. Please check API keys."
    );
  }

  private async callGemini(userMessage: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a helpful POS (Point of Sale) assistant for Café Bara. 
You help with:
- Product recommendations and suggestions
- Order assistance
- Customer inquiries
- Business insights and analytics
- Inventory management tips
Keep responses concise and relevant to café operations.

User: ${userMessage}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini error: ${error.error?.message || "Unknown error"}`);
    }

    const data = await response.json();
    const assistantMessage =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from Gemini";

    this.conversationHistory.push({
      role: "assistant",
      content: assistantMessage,
    });

    return assistantMessage;
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
            content: `You are a helpful POS (Point of Sale) assistant for Café Bara. 
You help with:
- Product recommendations and suggestions
- Order assistance
- Customer inquiries
- Business insights and analytics
- Inventory management tips
Keep responses concise and relevant to café operations.`,
          },
          ...this.conversationHistory,
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(
        `Deepseek error: ${data.error.message || "Unknown error"}`
      );
    }

    const assistantMessage = data.choices[0].message.content;

    this.conversationHistory.push({
      role: "assistant",
      content: assistantMessage,
    });

    return assistantMessage;
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }
}

export const aiService = new AIService();
