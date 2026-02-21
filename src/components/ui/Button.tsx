import * as React from "react";
import { Button as BaseButton, type ButtonProps as BaseButtonProps } from "@/components/ui/button";

type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantMap: Record<ButtonVariant, NonNullable<BaseButtonProps["variant"]>> = {
  primary: "default",
  outline: "outline",
  ghost: "ghost",
  danger: "destructive"
};

const sizeMap: Record<ButtonSize, NonNullable<BaseButtonProps["size"]>> = {
  sm: "sm",
  md: "default",
  lg: "lg",
  icon: "icon"
};

export type ButtonProps = Omit<BaseButtonProps, "variant" | "size"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading = false, disabled, ...props }, ref) => (
    <BaseButton
      ref={ref}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      disabled={disabled || isLoading}
      aria-busy={isLoading || props["aria-busy"]}
      {...props}
    />
  )
);

Button.displayName = "Button";
