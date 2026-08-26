import { formatDuration, formatSeq, isoToDisplay, shortDid } from "@/lib/utils";
import type { DashboardPayload, DeathMode, ReceiptRow } from "@/lib/technocore/types";
import { DEATH_MODE_COPY } from "@/lib/technocore/death";
import { Lifecycle, Section, VisibilityBadge } from "./primitives";

export function ReceiptTracker({ data }: { data: DashboardPayload }) {
  const now = Date.parse(data.generatedAt) || 0;
  return (
    <Section n="03" title="Receipt survival tracker" aside={`${data.receipts.length} tracked`}>
      <div className="grid gap-3 lg:grid-cols-3">
        {data.receipts.map((r) => (
          <ReceiptCard key={r.id} receipt={r} now={now} />
        ))}
      </div>
    </Section>
  );
}

function ReceiptCard({ receipt: r, now }: { receipt: ReceiptRow; now: number }) {
  const ageSec = r.posted_at && now ? (now - Date.parse(r.posted_at)) / 1000 : null;
  return (
    <article className="flex flex-col gap-3 rounded-lg bg-bg p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-fg">{r.label.replace(/-/g, " ")}</h3>
          <p className="font-mono text-xs text-muted">
            {r.room} · seq {formatSeq(r.seq)}
          </p>
        </div>
        <VisibilityBadge status={r.last_status} />
      </div>
      <Lifecycle status={r.last_status} />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Cell k="Original timestamp" v={isoToDisplay(r.posted_at)} />
        <Cell k="Age" v={ageSec == null ? "unknown" : formatDuration(ageSec)} />
        <Cell k="Distance from head" v={r.last_sequences_ahead == null ? "—" : formatSeq(r.last_sequences_ahead)} />
        <Cell
          k="Observable duration"
          v={
            r.survival_seconds == null
              ? r.last_status === "gone"
                ? "already gone when tracking began"
                : "still measuring"
              : formatDuration(r.survival_seconds)
          }
        />
        <Cell k="DID" v={shortDid(r.did)} />
        <Cell k="Client receipt" v={r.has_client_receipt ? "original posted JSON kept" : "sequence only"} />
        <Cell k="Record source" v={r.source === "original-study" ? "2026-08-25 field study" : "agent spec"} />
        <Cell
          k="Death mode"
          v={
            r.death_mode
              ? DEATH_MODE_COPY[r.death_mode as DeathMode]?.label ?? r.death_mode
              : r.last_status === "gone"
                ? "unclassified"
                : "not applicable yet"
          }
        />
      </dl>
      {r.death_mode_detail ? <p className="text-xs leading-relaxed text-subtle">{r.death_mode_detail}</p> : null}
      {r.text_preview ? (
        <p className="line-clamp-3 text-xs leading-relaxed text-subtle">{r.text_preview}</p>
      ) : (
        <p className="text-xs text-subtle">
          No client-side posted JSON on file for this sequence. Public room JSON does not retain signatures.
        </p>
      )}
    </article>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-wider text-muted uppercase">{k}</dt>
      <dd className="mt-0.5 text-fg">{v}</dd>
    </div>
  );
}
