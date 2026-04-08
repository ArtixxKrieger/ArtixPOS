import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-2xl border px-4 py-3.5 text-sm flex items-start gap-3 backdrop-blur-sm [&>svg]:shrink-0 [&>svg]:mt-0.5",
  {
    variants: {
      variant: {
        default:
          "bg-card/80 border-border/50 text-foreground [&>svg]:text-foreground/60",
        destructive:
          "bg-destructive/8 border-destructive/25 text-destructive dark:border-destructive/30 [&>svg]:text-destructive",
        warning:
          "bg-amber-500/8 border-amber-500/25 text-amber-700 dark:text-amber-400 dark:border-amber-500/20 [&>svg]:text-amber-500",
        success:
          "bg-emerald-500/8 border-emerald-500/25 text-emerald-700 dark:text-emerald-400 dark:border-emerald-500/20 [&>svg]:text-emerald-500",
        info:
          "bg-primary/8 border-primary/25 text-primary dark:border-primary/20 [&>svg]:text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("font-semibold leading-snug tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-[13px] leading-relaxed opacity-85 [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
