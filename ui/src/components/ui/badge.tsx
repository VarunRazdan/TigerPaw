import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-orange-600 text-white shadow",
        secondary: "border-transparent bg-neutral-800 text-neutral-300",
        destructive: "border-transparent bg-red-700 text-white shadow",
        outline: "border-neutral-700 text-neutral-300",
        success: "border-transparent bg-green-900 text-green-300",
        warning: "border-transparent bg-amber-900 text-amber-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
