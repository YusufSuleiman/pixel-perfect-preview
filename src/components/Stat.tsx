import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  tone,
  className,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "gain" | "loss" | "neutral";
  className?: string;
  accent?: "capital" | "profit" | "cash" | "fee" | "none";
}) {
  const accentBar =
    accent === "capital"
      ? "bg-capital"
      : accent === "profit"
        ? "bg-profit"
        : accent === "cash"
          ? "bg-cashline"
          : accent === "fee"
            ? "bg-fee"
            : "bg-transparent";

  return (
    <div className={cn("panel relative overflow-hidden p-4", className)}>
      {accent && accent !== "none" && <span className={cn("absolute inset-y-0 left-0 w-1", accentBar)} />}
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          "tnum mt-2 text-xl font-semibold md:text-2xl",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  );
}

export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
