import * as React from "react";
import { cn } from "@/lib/utils";

type IconButtonSize = "sm" | "md";

export type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: React.ReactNode;
  "aria-label": string;
  size?: IconButtonSize;
};

const sizeClasses: Record<IconButtonSize, string> = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-9 w-9 rounded-xl"
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = "md", className, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center border border-border/70 bg-card/80 text-muted-foreground transition-colors",
          "hover:bg-secondary hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50",
          "dark:bg-card/70",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
