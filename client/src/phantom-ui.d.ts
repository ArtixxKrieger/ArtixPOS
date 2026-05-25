import type { PhantomUiAttributes } from "@artixpos/skeleton-ui";

declare module "react/jsx-runtime" {
  export namespace JSX {
    interface IntrinsicElements {
      "phantom-ui": PhantomUiAttributes & { key?: React.Key };
    }
  }
}
