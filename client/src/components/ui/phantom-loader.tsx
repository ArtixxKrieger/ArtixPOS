interface PhantomLoaderProps {
  loading?: boolean;
  count?: number;
  countGap?: number;
  children?: React.ReactNode;
}

export function PhantomLoader({ children }: PhantomLoaderProps) {
  return <>{children}</>;
}
