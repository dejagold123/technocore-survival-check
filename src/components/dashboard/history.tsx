import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { formatDuration, formatRate, formatSeq, isoToDisplay } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/technocore/types";
import { Section } from "./primitives";

export function HistoryTable({
  data,
  onSearch,
}: {
  data: DashboardPayload;
  onSearch: (q: string) => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => onSearch(q), 280);
    return () => clearTimeout(t);
  }, [q, onSearch]);

  return (
    <Section
      n="07"
      title="Historical observations"
      aside={`${data.observations.length} shown`}
    >
      <label className="mb-3 flex items-center gap-2 rounded-md bg-bg px-3 py-2">
        <Search className="size-4 text-subtle" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by observation #, sequence, anomaly, conclusion"
          className="min-h-11 w-full bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
        />
      </label>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="font-mono text-[10px] tracking-wider text-muted uppercase">
            <tr className="border-b border-border">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Timestamp</th>
              <th className="px-2 py-2 font-medium">Room head</th>
              <th className="px-2 py-2 font-medium">Velocity</th>
              <th className="px-2 py-2 font-medium">Window</th>
              <th className="px-2 py-2 font-medium">Source</th>
              <th className="px-2 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.observations.map((o) => (
              <tr key={o.id} className="border-b border-border/70 align-top">
                <td className="px-2 py-2 font-mono tabular-nums text-accent">{o.id}</td>
                <td className="px-2 py-2 font-mono text-muted whitespace-nowrap">{isoToDisplay(o.observed_at)}</td>
                <td className="px-2 py-2 font-mono tabular-nums">
                  {formatSeq(o.current_seq)}
                  {o.sequence_growth != null ? (
                    <span className="text-subtle"> +{formatSeq(o.sequence_growth)}</span>
                  ) : null}
                </td>
                <td className="px-2 py-2 font-mono tabular-nums">
                  {formatRate(o.window_velocity_per_min ?? o.velocity_per_minute, 1)}
                </td>
                <td className="px-2 py-2 font-mono tabular-nums">
                  {o.window_span ?? "—"} · {formatDuration(o.window_seconds)}
                </td>
                <td className="px-2 py-2 text-muted">{o.source === "agent" ? "agent" : "prior study"}</td>
                <td className="px-2 py-2 text-fg">
                  <span className="line-clamp-2 leading-relaxed">{o.conclusion}</span>
                  {o.anomaly ? <span className="mt-0.5 block text-warn">{o.anomaly}</span> : null}
                </td>
              </tr>
            ))}
            {data.observations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-muted">
                  No observations match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
