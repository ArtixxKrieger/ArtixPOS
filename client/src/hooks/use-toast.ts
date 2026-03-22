import { sileo } from "sileo";

type ToastVariant = "default" | "destructive";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

function isDark() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function getToastFill() {
  return isDark()
    ? "#0f1728"
    : "#f4f6fa";
}

function inferType(opts: ToastOptions) {
  if (opts.variant === "destructive") return "error" as const;
  const combined = `${opts.title ?? ""} ${opts.description ?? ""}`.toLowerCase();
  if (combined.includes("error") || combined.includes("fail") || combined.includes("delete") || combined.includes("removed")) return "error" as const;
  if (combined.includes("warn")) return "warning" as const;
  if (combined.includes("info")) return "info" as const;
  return "success" as const;
}

function toast(opts: ToastOptions) {
  const type = inferType(opts);
  const id = sileo.show({
    title: opts.title,
    description: opts.description,
    type,
    duration: opts.duration ?? 3500,
    fill: getToastFill(),
  });
  return {
    id,
    dismiss: () => sileo.dismiss(id),
    update: () => {},
  };
}

function useToast() {
  return {
    toast,
    dismiss: (id?: string) => {
      if (id) sileo.dismiss(id);
      else sileo.clear();
    },
    toasts: [] as any[],
  };
}

export { useToast, toast };
