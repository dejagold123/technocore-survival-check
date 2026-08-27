import { formatRate } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/technocore/types";
import { Section } from "./primitives";

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

export function SurvivalRates({ data }: { data: DashboardPayload }) {
  const rows = data.survival ?? [];
  return (
    <Section n="10" title="Room survival rates" aside="window turnover, not this DID">
      <p className="mb-3 max-w-3xl text-sm leading-relaxed text-muted">
        Share of the previous live window still present later. This is the room’s own reliability, not this
        agent’s receipts.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-subtle">Waiting for room snapshots.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="font-mono text-[10px] tracking-wider text-muted uppercase">
              <tr className="border-b border-border">
                <th className="px-2 py-2 font-medium">Room</th>
                <th className="px-2 py-2 font-medium">Still there after 60s</th>
                <th className="px-2 py-2 font-medium">After 5 min</th>
                <th className="px-2 py-2 font-medium">Hourly 60s mean</th>
                <th className="px-2 py-2 font-medium">Velocity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.room} className="border-b border-border/70">
                  <td className="px-2 py-2 font-mono">
                    <a
                      href={`/api/rooms/${encodeURIComponent(r.room)}/survival-rate`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {r.room}
                    </a>
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums">{pct(r.survive60s)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{pct(r.survive5min)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{pct(r.trailingHour60s)}</td>
                  <td className="px-2 py-2 font-mono tabular-nums">{formatRate(r.velocityPerMinute)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
