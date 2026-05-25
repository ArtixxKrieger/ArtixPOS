export interface PhantomUiAttributes {
  loading?: boolean;
  "shimmer-direction"?: "ltr" | "rtl" | "ttb" | "btt";
  "shimmer-color"?: string;
  "background-color"?: string;
  duration?: number;
  "fallback-radius"?: number;
  animation?: "shimmer" | "pulse" | "breathe" | "solid";
  stagger?: number;
  reveal?: number;
  count?: number;
  "count-gap"?: number;
  debug?: boolean;
  children?: unknown;
  class?: string;
  id?: string;
  style?: string | Record<string, string>;
  slot?: string;
  key?: string | number;
  ref?: unknown;
  [key: `data-${string}`]: string | undefined;
}

export type { PhantomUiAttributes as SkeletonUiAttributes };

declare global {
  interface HTMLElementTagNameMap {
    "phantom-ui": HTMLElement;
  }
  namespace JSX {
    interface IntrinsicElements {
      "phantom-ui": PhantomUiAttributes;
    }
  }
}
