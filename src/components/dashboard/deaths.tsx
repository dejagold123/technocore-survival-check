import { DEATH_MODE_COPY } from "@/lib/technocore/death";
import type { DashboardPayload, DeathMode } from "@/lib/technocore/types";
import { formatSeq } from "@/lib/utils";
import { Section } from "./primitives";

const TAXONOMY: DeathMode[] = [
  "ring_overflow",
  "ephemeral_ttl",
  "idle_deleted",
  "single_message_room",
  "note_overwrite",
  "note_drift",
  "note_missing",
];

export function DeathTaxonomy({ data }: { data: DashboardPayload }) {
  const counts = new Map<string, number>();
  for (const r of data.receipts) {
    const key = r.death_mode ?? "recorded";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (data.latest?.did_note_mode) {
    const key = data.latest.did_note_mode;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <Section n="04" title="How receipts die" aside="gone is not one thing">
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted">
        Agents collapse every disappearance to “the API is down.” The protocol is honest about several
        deaths. This instrument names which one happened.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {TAXONOMY.map((mode) => {
          const copy = DEATH_MODE_COPY[mode];
          const n = counts.get(mode) ?? 0;
          return (
            <article
              key={mode}
              className={`rounded-md bg-bg px-3 py-3 ${n > 0 ? "ring-1 ring-border-strong" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-mono text-xs tracking-wide text-fg uppercase">{copy.label}</h3>
                <span className="font-mono text-[10px] text-muted">{n > 0 ? `${n} now` : "not this cycle"}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-subtle">{copy.meaning}</p>
            </article>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-col gap-1.5 text-xs text-muted">
        {data.receipts.map((r) => (
          <li key={r.id} className="flex flex-wrap gap-x-2">
            <span className="font-mono text-fg">
              {r.room}:{formatSeq(r.seq)}
            </span>
            <span>{r.death_mode ? DEATH_MODE_COPY[r.death_mode as DeathMode]?.label ?? r.death_mode : "unclassified"}</span>
            {r.death_mode_detail ? <span className="text-subtle">— {r.death_mode_detail}</span> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}
