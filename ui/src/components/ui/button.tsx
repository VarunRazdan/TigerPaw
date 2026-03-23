import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-orange-600 text-white shadow hover:bg-orange-500 hover:shadow-md",
        destructive: "bg-red-700 text-white shadow-sm hover:bg-red-600 hover:shadow-md",
        outline:
          "border border-white/[0.08] bg-transparent text-neutral-300 shadow-sm hover:bg-white/[0.06] hover:text-neutral-100 hover:shadow-md hover:border-white/[0.14]",
        secondary:
          "bg-white/[0.06] text-neutral-300 shadow-sm hover:bg-white/[0.10] hover:shadow-md",
        ghost: "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200 hover:shadow-sm",
        link: "text-orange-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
