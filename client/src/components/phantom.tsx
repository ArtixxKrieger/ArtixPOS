import type { ReactNode, CSSProperties } from "react";

export interface PhantomProps {
  loading?: boolean;
  animation?: "shimmer" | "pulse" | "breathe" | "solid";
  reveal?: number;
  stagger?: number;
  duration?: number;
  count?: number;
  "count-gap"?: number;
  "shimmer-direction"?: "ltr" | "rtl" | "ttb" | "btt";
  "shimmer-color"?: string;
  "background-color"?: string;
  "fallback-radius"?: number;
  debug?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  [key: string]: unknown;
}

export function Phantom({
  loading,
  animation = "shimmer",
  reveal = 0.25,
  stagger = 0.04,
  children,
  ...rest
}: PhantomProps) {
  return (
    <phantom-ui
      loading={loading || undefined}
      animation={animation}
      reveal={reveal}
      stagger={stagger}
      {...(rest as any)}
    >
      {children}
    </phantom-ui>
  );
}

export function makePlaceholders<T>(count: number, shape: T): T[] {
  return Array.from({ length: count }, () => ({ ...(shape as object) } as T));
}
