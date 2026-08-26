import { formatDuration, formatRate, formatSeq, isoToDisplay } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/technocore/types";
import { Section } from "./primitives";

export function LiveObservation({ data }: { data: DashboardPayload }) {
  const o = data.latest;
  const check = data.primaryCheck;
  const statusLabel =
    check?.visibility_status === "observable"
      ? "still visible"
      : check?.visibility_status === "near_edge"
        ? "near window edge"
        : "no longer visible";

  return (
    <Section
      n="01"
      title="Live observation"
      aside={o ? `Observation #${o.id} · ${o.source === "agent" ? "agent cycle" : "prior study"}` : "awaiting probe"}
    >
      {!o ? (
        <p className="text-sm text-muted">The agent has not completed a cycle yet.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
            <Row k="Observation time" v={isoToDisplay(o.observed_at)} />
            <Row k="Room" v={o.room} />
            <Row k="Current room head" v={`sequence ${formatSeq(o.current_seq)}`} />
            <Row k="Previous room head" v={o.previous_seq == null ? "—" : `sequence ${formatSeq(o.previous_seq)}`} />
            <Row
              k="Sequence growth"
              v={o.sequence_growth == null ? "—" : `${formatSeq(o.sequence_growth)} messages`}
            />
            <Row
              k="Estimated velocity"
              v={
                (o.window_velocity_per_min ?? o.velocity_per_minute) == null
                  ? "calibrating"
                  : `${formatRate(o.window_velocity_per_min ?? o.velocity_per_minute)} messages per minute`
              }
            />
            <Row k="Tracked receipt" v={`sequence ${formatSeq(data.agent.firstTrackedSeq)}`} />
            <Row
              k="Distance from head"
              v={check?.sequences_ahead == null ? "—" : formatSeq(check.sequences_ahead)}
            />
            <Row k="Live room status" v={statusLabel} />
            <Row
              k="DID status"
              v={
                o.did_note_reachable && o.did_note_contains_did
                  ? "durable identity record available"
                  : o.did_note_reachable
                    ? "note reachable, DID missing"
                    : "DID note unreachable"
              }
            />
            <Row k="Window sample" v={`${o.window_count ?? "—"} msgs · span ${o.window_span ?? "—"}`} />
            <Row k="Window duration" v={formatDuration(o.window_seconds)} />
          </dl>
          <div className="flex flex-col gap-3">
            <WindowRibbon data={data} />
            <blockquote className="rounded-md bg-bg px-3 py-3 text-sm leading-relaxed text-fg">
              <div className="mb-1 font-mono text-[10px] tracking-[0.16em] text-muted uppercase">Conclusion</div>
              {o.conclusion}
            </blockquote>
            {o.anomaly ? (
              <p className="font-mono text-xs text-warn">Anomaly: {o.anomaly}</p>
            ) : (
              <p className="font-mono text-xs text-subtle">No activity spike detected this cycle.</p>
            )}
            {o.error_message ? <p className="font-mono text-xs text-gone">{o.error_message}</p> : null}
          </div>
        </div>
      )}
    </Section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{k}</dt>
      <dd className="text-fg">{v}</dd>
    </div>
  );
}

function WindowRibbon({ data }: { data: DashboardPayload }) {
  const o = data.latest;
  if (!o?.window_first_seq || !o.window_last_seq) {
    return <div className="rounded-md bg-bg px-3 py-4 text-xs text-muted">Window ribbon unavailable.</div>;
  }
  const first = o.window_first_seq;
  const last = o.window_last_seq;
  const roomReceipts = data.receipts.filter((r) => r.room === o.room);
  const dropped = roomReceipts.filter((r) => r.seq < first).sort((a, b) => a.seq - b.seq);
  const inside = roomReceipts.filter((r) => r.seq >= first && r.seq <= last);

  const droppedX = (i: number, n: number) => {
    if (n <= 1) return 12;
    return 6 + (i / (n - 1)) * 24;
  };
  const liveX = (seq: number) => 38 + ((seq - first) / Math.max(last - first, 1)) * 60;

  return (
    <div className="rounded-md bg-bg px-3 py-3">
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] tracking-widest text-muted uppercase">
        <span>Persistence vs disappearance</span>
        <span>
          {formatSeq(first)} → {formatSeq(last)}
        </span>
      </div>
      <div className="relative h-12">
        <div className="absolute top-4 left-0 h-px w-[34%] bg-gone/40" />
        <div className="absolute top-3.5 right-0 h-2 w-[62%] rounded-sm bg-accent/80" />
        {dropped.map((r, i) => (
          <div
            key={r.id}
            className="absolute top-1 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${droppedX(i, dropped.length)}%` }}
            title={`${r.label} seq ${r.seq} — outside window`}
          >
            <span className="size-2 rounded-full bg-gone" />
            <span className="mt-4 font-mono text-[9px] text-subtle">{r.seq}</span>
          </div>
        ))}
        {inside.map((r) => (
          <div
            key={r.id}
            className="absolute top-1 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${liveX(r.seq)}%` }}
            title={`${r.label} seq ${r.seq}`}
          >
            <span className="size-2 rounded-full bg-live" />
            <span className="mt-4 font-mono text-[9px] text-subtle">{r.seq}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between font-mono text-[10px] text-subtle">
        <span>dropped from ring</span>
        <span>live window</span>
        <span>head</span>
      </div>
    </div>
  );
}
