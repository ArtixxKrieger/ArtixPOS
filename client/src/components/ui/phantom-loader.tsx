interface PhantomLoaderProps {
  loading?: boolean;
  count?: number;
  countGap?: number;
  children?: React.ReactNode;
}

/**
 * Thin wrapper around <phantom-ui> (github.com/Aejkatappaja/phantom-ui).
 *
 * Colors are passed as CSS var() references so the browser resolves the
 * correct value for the active theme with zero JS. The vars are defined in
 * index.css:
 *   :root   { --phantom-ui-bg: ...; --phantom-ui-hi: ...; }
 *   .dark   { --phantom-ui-bg: ...; --phantom-ui-hi: ...; }
 *
 * The styleMap inside <phantom-ui> sets:
 *   --shimmer-bg:    var(--phantom-ui-bg)
 *   --shimmer-color: var(--phantom-ui-hi)
 * on .shimmer-overlay. CSS resolves --phantom-ui-* through shadow DOM
 * inheritance from the host element — no MutationObserver or useState needed.
 *
 * Usage (list / grid):
 *   <PhantomLoader loading={isLoading} count={skeletonCount} countGap={12}>
 *     <TemplateCard />     ← one template, cloned `count` times by the lib
 *   </PhantomLoader>
 *
 * Usage (single item):
 *   <PhantomLoader loading={isLoading}>
 *     <RealCard data={data ?? placeholderData} />
 *   </PhantomLoader>
 */
export function PhantomLoader({ loading = true, count, countGap, children }: PhantomLoaderProps) {
  return (
    <phantom-ui
      loading={loading}
      count={count ?? 1}
      count-gap={countGap ?? 0}
      background-color="var(--phantom-ui-bg)"
      shimmer-color="var(--phantom-ui-hi)"
    >
      {children}
    </phantom-ui>
  );
}
