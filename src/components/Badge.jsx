import React from "react";

const VARIANT_CLASSES = {
  neutral:  "bg-vx-surface-2 text-vx-text",
  positive: "bg-vx-surface-positive text-vx-positive",
  caution:  "bg-vx-surface-caution text-vx-caution",
  risk:     "bg-vx-surface-negative text-vx-negative",
  info:     "bg-vx-surface-info text-vx-info",
};

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-xs gap-1",
  md: "px-2.5 py-1 text-sm gap-1.5",
};

export function Badge({ children, variant = "neutral", size = "sm", icon: Icon }) {
  const vc = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.neutral;
  const sc = SIZE_CLASSES[size] ?? SIZE_CLASSES.sm;
  return (
    <span className={`inline-flex items-center font-medium rounded-full whitespace-nowrap ${vc} ${sc}`}>
      {Icon && <Icon size={size === "md" ? 14 : 12} className="shrink-0" />}
      {children}
    </span>
  );
}

export default Badge;
