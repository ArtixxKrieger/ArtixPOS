import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MessageCircle, Send, RotateCcw, Sparkles, Copy, Check, Download, AlertCircle } from "lucide-react";
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
        "Hi there! 👋 I'm your intelligent POS assistant. Ask me about your recent sales, top products, revenue, analytics, or any café operations topics. I can also generate sales reports for you!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadReport = async () => {
    try {
      const response = await fetch("/api/ai/report");
      if (!response.ok) throw new Error("Failed to download report");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `café-bara-sales-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Report downloaded",
        description: "Your sales report is ready!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download report.",
        variant: "destructive",
      });
    }
  };

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
        description: "Unable to process your request. Please try again.",
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
            "Hi there! 👋 I'm your intelligent POS assistant. Ask me about your recent sales, top products, revenue, analytics, or any café operations topics. I can also generate sales reports for you!",
          timestamp: new Date(),
        },
      ]);

      toast({
        title: "Chat cleared",
        description: "Ready for a fresh conversation.",
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
    <div className="space-y-8 animate-in fade-in duration-700 pb-10 h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center text-white shadow-xl">
            <Sparkles className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight">AI Assistant</h2>
            <p className="text-sm text-muted-foreground font-medium">Smart POS operations assistant</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadReport}
            className="rounded-xl gap-2 font-bold border-border/50 hover:bg-secondary/50"
            title="Download sales report as CSV"
          >
            <Download className="h-4 w-4" />
            Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearHistory}
            className="rounded-xl gap-2 font-bold border-border/50 hover:bg-secondary/50"
          >
            <RotateCcw className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl items-start">
        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-bold text-amber-900">POS-Only Assistant</p>
          <p className="text-amber-800/70">I only discuss café operations, sales, products, and analytics. Ask me about your recent sales, top products, or download a sales report!</p>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-br from-card to-background rounded-[2.5rem] shadow-xl border border-border/50 overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              } animate-in fade-in slide-in-from-bottom-2 duration-500 gap-2`}
            >
              <div
                className={`max-w-[75%] rounded-3xl px-6 py-4 shadow-lg transition-all ${
                  message.role === "user"
                    ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-br-none hover:shadow-xl"
                    : "bg-muted/60 backdrop-blur-sm text-foreground rounded-bl-none border border-border/50 hover:bg-muted/80"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {message.content}
                </p>
                <div className="flex items-center justify-between mt-2 gap-2">
                  <span className={`text-xs ${message.role === "user" ? "text-blue-100" : "text-muted-foreground"}`}>
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {message.role === "assistant" && (
                    <button
                      onClick={() => copyToClipboard(message.content, message.id)}
                      className="opacity-50 hover:opacity-100 transition-opacity"
                      title="Copy message"
                    >
                      {copied === message.id ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start animate-in fade-in">
              <div className="bg-muted/60 backdrop-blur-sm rounded-3xl rounded-bl-none px-6 py-4 border border-border/50">
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

        {/* Input Area */}
        <div className="border-t border-border/50 p-6 bg-gradient-to-t from-muted/30 to-transparent">
          <div className="flex gap-3">
            <Input
              placeholder="Ask about sales, products, analytics..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              disabled={isLoading}
              className="rounded-2xl bg-background/80 backdrop-blur-sm border-border/50 shadow-sm text-base placeholder:text-muted-foreground/60 focus-visible:ring-blue-500/20 disabled:opacity-50"
            />
            <Button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="h-12 w-12 p-0 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg hover:shadow-xl hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
