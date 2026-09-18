import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

export type ChipNormalShape = "round" | "square";
export type ChipNormalSize = "s" | "m" | "lg";

export interface ChipNormalProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  shape?: ChipNormalShape;
  size?: ChipNormalSize;
  selected?: boolean;
  children: ReactNode;
}

const shapeSizeClasses: Record<ChipNormalShape, Record<ChipNormalSize, string>> = {
  round: {
    s: "rounded-[20px] px-3 py-2 text-xs tracking-[0.12px]",
    m: "rounded-[20px] px-4 py-2 text-sm",
    lg: "rounded-[20px] px-4 py-2 text-sm",
  },
  square: {
    s: "h-[42px] rounded-lg px-4 py-2 text-[13px]",
    m: "h-[42px] rounded-lg px-4 py-2 text-[13px]",
    lg: "h-[60px] rounded-xl px-4 py-3 text-[17px]",
  },
};

export function ChipNormal({
  shape = "round",
  size = "m",
  selected = false,
  className,
  children,
  ...rest
}: ChipNormalProps) {
  const isRoundDefault = shape === "round" && !selected;
  const classes = cn(
    "inline-flex items-center justify-center border border-solid text-center leading-[1.4] whitespace-nowrap transition-colors",
    shapeSizeClasses[shape][size],
    isRoundDefault ? "font-medium" : "font-semibold",
    selected
      ? "border-primary-500 bg-primary-100 text-primary-600"
      : "border-grayscale-300 bg-white text-grayscale-500",
    className,
  );

  return (
    <button type="button" aria-pressed={selected} className={classes} {...rest}>
      {children}
    </button>
  );
}
