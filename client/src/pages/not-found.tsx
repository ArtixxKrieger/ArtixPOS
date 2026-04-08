import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { WifiOff, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="text-center max-w-xs">
        <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-muted/60 border border-border/50 flex items-center justify-center shadow-inner">
          <WifiOff className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          This page doesn't exist or may have been moved.
        </p>
        <Button
          className="mt-8 rounded-xl h-10 px-5 text-sm font-medium"
          onClick={() => setLocation("/")}
          data-testid="button-go-home"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
