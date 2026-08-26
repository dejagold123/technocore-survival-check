import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatRate, formatSeq } from "@/lib/utils";
import type { DashboardPayload, VelocityPoint } from "@/lib/technocore/types";
import { Section } from "./primitives";

export function VelocityChart({ data }: { data: DashboardPayload }) {
  const series: VelocityPoint[] =
    data.velocity.length > 0
      ? data.velocity
      : data.observations
          .filter((o) => o.source === "agent" && o.room === data.agent.primaryRoom)
          .slice()
          .reverse()
          .map((o) => ({
            id: o.id,
            observed_at: o.observed_at,
            current_seq: o.current_seq,
            sequence_growth: o.sequence_growth,
            velocity_per_minute: o.velocity_per_minute,
            window_velocity_per_min: o.window_velocity_per_min,
            window_seconds: o.window_seconds,
            anomaly: o.anomaly,
            probe_ok: o.probe_ok,
          }));

  const rows = series.map((p) => ({
    t: p.observed_at.slice(11, 19),
    vel: p.window_velocity_per_min ?? p.velocity_per_minute,
    growth: p.sequence_growth,
    head: p.current_seq,
    spike: p.anomaly?.includes("spike") ? p.window_velocity_per_min ?? p.velocity_per_minute : null,
    quiet: p.anomaly?.includes("quiet") ? p.window_velocity_per_min ?? p.velocity_per_minute : null,
  }));

  return (
    <Section n="04" title="Message velocity" aside={`${rows.length} live samples · messages per minute`}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          Waiting for the first live cycle. The agent samples the room every 60 seconds while this instrument
          is running.
        </p>
      ) : (
        <div className="h-56 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="color-mix(in oklab, var(--color-fg) 8%, transparent)" vertical={false} />
              <XAxis
                dataKey="t"
                tick={{ fill: "var(--color-subtle)", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                axisLine={{ stroke: "var(--color-border)" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: "var(--color-subtle)", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(v: number) => formatRate(v, 0)}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: "IBM Plex Sans, sans-serif",
                  color: "var(--color-fg)",
                }}
                labelStyle={{ color: "var(--color-muted)" }}
                formatter={(value, name) => {
                  const n = typeof value === "number" ? value : Number(value);
                  if (name === "vel") return [`${formatRate(n, 1)} / min`, "velocity"];
                  if (name === "growth") return [formatSeq(n), "growth"];
                  return [formatRate(n, 1), String(name)];
                }}
              />
              <Area
                type="monotone"
                dataKey="vel"
                stroke="var(--color-accent)"
                fill="color-mix(in oklab, var(--color-accent) 22%, transparent)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="spike"
                stroke="var(--color-warn)"
                strokeWidth={0}
                dot={{ r: 3, fill: "var(--color-warn)" }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Latest velocity" value={`${formatRate(rows.at(-1)?.vel ?? null, 1)} / min`} />
        <Stat
          label="Last interval growth"
          value={rows.at(-1)?.growth == null ? "—" : `${formatSeq(rows.at(-1)?.growth)} msgs`}
        />
        <Stat
          label="Spikes marked"
          value={String(data.velocity.filter((v) => v.anomaly?.includes("spike")).length)}
        />
        <Stat
          label="Quiet periods"
          value={String(data.velocity.filter((v) => v.anomaly?.includes("quiet")).length)}
        />
      </div>
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-bg px-3 py-2">
      <div className="font-mono text-[10px] tracking-wider text-muted uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-sm tabular-nums text-fg">{value}</div>
    </div>
  );
}
