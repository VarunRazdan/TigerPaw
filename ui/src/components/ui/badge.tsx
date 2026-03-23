import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-orange-600 text-white shadow hover:bg-orange-500 transition-colors duration-200",
        secondary:
          "border-transparent bg-white/[0.06] text-neutral-300 backdrop-blur-sm hover:bg-white/[0.10] transition-colors duration-200",
        destructive:
          "border-transparent bg-red-700 text-white shadow hover:bg-red-600 transition-colors duration-200",
        outline:
          "border-white/[0.08] text-neutral-300 hover:border-white/[0.14] hover:bg-white/[0.04] transition-colors duration-200",
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
