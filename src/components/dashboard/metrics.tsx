import { formatDuration, formatRate, formatSeq } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/technocore/types";
import { Metric } from "./primitives";

export function MetricStrip({ data }: { data: DashboardPayload }) {
  const { latest, receipts, agent } = data;
  const visible = receipts.filter((r) => r.last_status === "observable" || r.last_status === "near_edge").length;
  const vel = latest?.window_velocity_per_min ?? latest?.velocity_per_minute;
  const survivalTone =
    visible === 0 ? "gone" : receipts.some((r) => r.last_status === "near_edge") ? "warn" : "live";

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <Metric
        label="Current room head"
        value={formatSeq(latest?.current_seq)}
        hint={`${agent.primaryRoom} · seq`}
      />
      <Metric
        label="Message velocity"
        value={vel == null ? "calibrating" : `${formatRate(vel, 0)}`}
        hint="messages / minute"
        tone={latest?.anomaly?.includes("spike") ? "warn" : "default"}
      />
      <Metric
        label="Live window estimate"
        value={formatDuration(latest?.window_seconds)}
        hint={latest?.window_span ? `${latest.window_span} messages retained` : "from sampled ring"}
      />
      <Metric label="Tracked receipts" value={String(receipts.length)} hint="across rooms" />
      <Metric
        label="Receipt survival"
        value={visible === 0 ? "none live" : `${visible} live`}
        hint={`${receipts.length - visible} outside window`}
        tone={survivalTone}
      />
      <Metric
        label="Agent status"
        value={agent.status}
        hint={
          data.persistence === "neon"
            ? "hosted Postgres"
            : "preview DB · not 24/7"
        }
        tone={agent.status === "error" ? "gone" : agent.status === "observing" ? "live" : "warn"}
      />
    </div>
  );
}
