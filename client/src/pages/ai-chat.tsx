import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Send, RotateCcw, Zap, Zap2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hi! I'm your Café Bara AI assistant. I can help you with product recommendations, order assistance, customer inquiries, and business insights. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to get AI response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("Clear chat history?")) return;

    try {
      const response = await fetch("/api/ai/clear", { method: "POST" });
      if (!response.ok) throw new Error("Failed to clear history");

      setMessages([
        {
          id: "1",
          role: "assistant",
          content:
            "Hi! I'm your Café Bara AI assistant. I can help you with product recommendations, order assistance, customer inquiries, and business insights. How can I help you today?",
          timestamp: new Date(),
        },
      ]);

      toast({
        title: "Chat cleared",
        description: "Conversation history has been cleared.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear history.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10 h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white shadow-xl">
            <MessageCircle className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight">AI Assistant</h2>
            <p className="text-sm text-muted-foreground font-medium">
              Powered by Gemini + Deepseek (with fallback)
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleClearHistory}
          className="rounded-xl gap-2 font-bold border-border/50"
        >
          <RotateCcw className="h-4 w-4" />
          Clear Chat
        </Button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-card rounded-3xl shadow-lg border border-border/50 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              } animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              <div
                className={`max-w-[70%] rounded-3xl px-6 py-4 shadow-sm ${
                  message.role === "user"
                    ? "bg-gradient-to-r from-primary to-violet-600 text-white rounded-br-none"
                    : "bg-muted/40 text-foreground rounded-bl-none border border-border/50"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
                <span
                  className={`text-xs mt-2 block ${
                    message.role === "user"
                      ? "text-white/60"
                      : "text-muted-foreground"
                  }`}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted/40 rounded-3xl rounded-bl-none px-6 py-4 border border-border/50">
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce delay-100" />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border/50 p-6 bg-muted/20">
          <div className="flex gap-3">
            <Input
              placeholder="Ask about products, analytics, orders..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              disabled={isLoading}
              className="rounded-2xl bg-background border-border/50 shadow-sm text-base placeholder:text-muted-foreground/60 focus-visible:ring-primary/20"
            />
            <Button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="h-12 w-12 p-0 rounded-2xl bg-gradient-to-r from-primary to-violet-600 shadow-lg hover:opacity-90 transition-all"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
            <Zap className="h-3 w-3" /> Powered by Gemini with Deepseek fallback
          </p>
        </div>
      </div>
    </div>
  );
}
