import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { CheckCircle2, XCircle, Clock, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Status = "verifying" | "success" | "error" | "expired";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>("verifying");
  const [countdown, setCountdown] = useState(3);
  const [, navigate] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
          credentials: "include",
        });
        if (res.ok) {
          setStatus("success");
          await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus(data.code === "EXPIRED" ? "expired" : "error");
        }
      } catch {
        setStatus("error");
      }
    })();
  }, []);

  // Countdown timer for auto-redirect on success
  useEffect(() => {
    if (status !== "success") return;
    if (countdown <= 0) {
      navigate("/");
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [status, countdown, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-6">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardContent className="flex flex-col items-center text-center pt-10 pb-8 px-8">
          {/* Logo */}
          <div className="mb-8">
            <span className="text-2xl font-extrabold text-foreground">Artix</span>
            <span className="text-2xl font-extrabold text-violet-600">POS</span>
          </div>

          {status === "verifying" && <VerifyingState />}
          {status === "success" && <SuccessState countdown={countdown} />}
          {status === "error" && <ErrorState />}
          {status === "expired" && <ExpiredState />}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} ArtixPOS. All rights reserved.
      </p>
    </div>
  );
}

function VerifyingState() {
  return (
    <>
      <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center mb-5">
        <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
      </div>
      <h1 className="text-xl font-bold text-foreground mb-2">Verifying your email…</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Just a moment while we confirm your address.
      </p>
    </>
  );
}

function SuccessState({ countdown }: { countdown: number }) {
  return (
    <>
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
      </div>
      <h1 className="text-xl font-bold text-foreground mb-2">Email verified!</h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">
        Your account is confirmed and ready to use.
      </p>
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200">
        <div className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">
          {countdown}
        </div>
        <span className="text-sm text-emerald-700 font-medium">
          Redirecting you to the app…
        </span>
      </div>
    </>
  );
}

function ErrorState() {
  return (
    <>
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-5">
        <XCircle className="w-8 h-8 text-red-500" />
      </div>
      <h1 className="text-xl font-bold text-foreground mb-2">Invalid link</h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">
        This verification link is invalid or has already been used. Please request a new
        one from inside the app.
      </p>
      <Button asChild variant="default" className="bg-violet-600 hover:bg-violet-700">
        <a href="/login">Back to login</a>
      </Button>
    </>
  );
}

function ExpiredState() {
  return (
    <>
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-5">
        <Clock className="w-8 h-8 text-amber-500" />
      </div>
      <h1 className="text-xl font-bold text-foreground mb-2">Link expired</h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        This link is only valid for 24 hours. Sign in and request a new verification
        email from the banner inside the app.
      </p>
      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 mb-6 text-left">
        <Mail className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-xs text-amber-700">
          Once you're logged in, look for the purple banner at the top of the page and
          click <strong>Resend email</strong>.
        </p>
      </div>
      <Button asChild variant="default" className="bg-violet-600 hover:bg-violet-700">
        <a href="/login">Back to login</a>
      </Button>
    </>
  );
}
