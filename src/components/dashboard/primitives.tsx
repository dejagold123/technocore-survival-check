import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { VisibilityStatus } from "@/lib/technocore/types";

export function Section({
  n,
  title,
  aside,
  children,
}: {
  n: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface p-4 shadow-border sm:p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs tracking-widest text-accent">{n}</span>
          <h2 className="text-sm font-medium tracking-wide text-fg sm:text-base">{title}</h2>
        </div>
        {aside ? <div className="text-xs text-muted">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "live" | "warn" | "gone";
}) {
  const valueColor =
    tone === "live"
      ? "text-live"
      : tone === "warn"
        ? "text-warn"
        : tone === "gone"
          ? "text-gone"
          : "text-fg";
  return (
    <div className="min-w-0 rounded-md bg-surface-2 px-3 py-3 sm:px-4">
      <div className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">{label}</div>
      <div className={cn("mt-1 font-mono text-xl tabular-nums tracking-tight sm:text-2xl", valueColor)}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-subtle">{hint}</div> : null}
    </div>
  );
}

export function StatusDot({ status }: { status: "observing" | "calibrating" | "error" | "idle" }) {
  const color =
    status === "observing"
      ? "bg-live"
      : status === "calibrating"
        ? "bg-warn"
        : status === "error"
          ? "bg-gone"
          : "bg-subtle";
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs tracking-wide text-muted uppercase">
      <span className={cn("size-1.5 rounded-full", color)} />
      {status}
    </span>
  );
}

export function VisibilityBadge({ status }: { status: VisibilityStatus | string }) {
  const map: Record<string, { label: string; className: string }> = {
    recorded: { label: "Recorded", className: "text-fg bg-surface-2" },
    observable: { label: "Observable", className: "text-live bg-live/10" },
    near_edge: { label: "Near window edge", className: "text-warn bg-warn/10" },
    gone: { label: "No longer visible", className: "text-gone bg-gone/10" },
  };
  const m = map[status] ?? map.gone;
  return (
    <span className={cn("inline-flex rounded-sm px-2 py-0.5 font-mono text-[11px] tracking-wide", m.className)}>
      {m.label}
    </span>
  );
}

export function Lifecycle({ status }: { status: VisibilityStatus | string }) {
  const steps: { key: VisibilityStatus; label: string }[] = [
    { key: "recorded", label: "Recorded" },
    { key: "observable", label: "Observable" },
    { key: "near_edge", label: "Near edge" },
    { key: "gone", label: "No longer visible" },
  ];
  const idx = Math.max(
    0,
    steps.findIndex((s) => s.key === status),
  );
  return (
    <ol className="grid grid-cols-4 gap-1">
      {steps.map((s, i) => {
        const active = i === idx || (status === "gone" && i === 3) || (i === 0 && true);
        const reached = i <= idx || s.key === "recorded";
        return (
          <li
            key={s.key}
            className={cn(
              "rounded-sm px-1 py-1.5 text-center font-mono text-[10px] leading-tight tracking-wide",
              reached ? "bg-surface-2 text-fg" : "text-subtle",
              active && s.key === "observable" && "text-live",
              active && s.key === "near_edge" && "text-warn",
              active && s.key === "gone" && "text-gone",
              active && "ring-1 ring-border-strong",
            )}
          >
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono tabular-nums", className)}>{children}</span>;
}
