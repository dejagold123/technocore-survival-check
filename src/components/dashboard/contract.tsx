import { formatBytes, formatDuration, formatSeq } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/technocore/types";
import { DEATH_MODE_COPY } from "@/lib/technocore/death";
import { Section } from "./primitives";

export function ContractPanel({ data }: { data: DashboardPayload }) {
  const o = data.latest;
  const advertisedRing = o?.advertised_ring_bytes ?? null;
  const observedBytes = o?.observed_window_bytes ?? null;
  const miss = o?.miss_skipped === true;
  const noteMode = o?.did_note_mode ?? null;
  const noteCopy = noteMode && noteMode in DEATH_MODE_COPY ? DEATH_MODE_COPY[noteMode as keyof typeof DEATH_MODE_COPY] : null;

  return (
    <Section
      n="02"
      title="Advertised contract vs observed ring"
      aside={o?.contract_ok ? "agent.json read this cycle" : "contract unread"}
    >
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted">
        Technocore publishes limits in{" "}
        <a
          href="https://technocore.chat/.well-known/agent.json"
          className="text-accent underline-offset-2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          /.well-known/agent.json
        </a>
        . The live window is a rolling ring, not that budget. This panel is the outside measurement of that gap.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="font-mono text-[10px] tracking-wider text-muted uppercase">
            <tr className="border-b border-border">
              <th className="px-2 py-2 font-medium">Claim</th>
              <th className="px-2 py-2 font-medium">Advertised</th>
              <th className="px-2 py-2 font-medium">Observed this cycle</th>
            </tr>
          </thead>
          <tbody>
            <Cmp
              claim="Room ring"
              advertised={formatBytes(advertisedRing)}
              observed={`${formatBytes(observedBytes)} sampled · span ${o?.window_span ?? "—"}`}
            />
            <Cmp
              claim="Idle retention"
              advertised={formatDuration(o?.advertised_retention_seconds)}
              observed={`live window ${formatDuration(o?.window_seconds)}`}
            />
            <Cmp
              claim="Ephemeral TTL"
              advertised={formatDuration(o?.advertised_ephemeral_ttl_seconds)}
              observed="tracked rooms are not e- class"
            />
            <Cmp
              claim="Reads / minute / IP"
              advertised={o?.advertised_reads_per_minute == null ? "—" : String(o.advertised_reads_per_minute)}
              observed={
                o?.http_429
                  ? "HTTP 429 this cycle"
                  : o?.rate_remaining == null
                    ? "no budget footer (still above 25%)"
                    : `${o.rate_remaining} remaining`
              }
            />
            <Cmp
              claim="Miss probe (since = head − 500)"
              advertised="contiguous seq; first_seq > since+1 means you missed lines"
              observed={
                miss
                  ? `skipped · first_seq ${formatSeq(o?.miss_first_seq)} · readable depth ${o?.readable_depth ?? "—"}`
                  : o?.miss_first_seq == null
                    ? "not probed"
                    : `contiguous from ${formatSeq(o.miss_first_seq)}`
              }
              warn={miss}
            />
            <Cmp
              claim="Durable storage"
              advertised={o?.contract_ok ? "agent.json trust.durable = false" : "—"}
              observed="nothing here is an archive"
            />
            <Cmp
              claim="DID note"
              advertised="world-writable cache, not a registrar"
              observed={noteCopy ? `${noteCopy.label}${o?.did_note_sha256 ? ` · ${o.did_note_sha256.slice(0, 12)}…` : ""}` : "unmeasured"}
              warn={noteMode === "note_overwrite" || noteMode === "note_missing" || noteMode === "note_drift"}
            />
          </tbody>
        </table>
      </div>
      <p className="mt-4 font-mono text-xs leading-relaxed text-subtle">
        Persistence: {data.persistence === "neon" ? "Postgres (survives restarts)" : "local preview DB (wiped on restart)"}.
        Minute ping: {data.observePath}. Hosted serverless hosts sleep; without that ping the observer only runs while someone is looking.
      </p>
    </Section>
  );
}

function Cmp({
  claim,
  advertised,
  observed,
  warn,
}: {
  claim: string;
  advertised: string;
  observed: string;
  warn?: boolean;
}) {
  return (
    <tr className="border-b border-border/70 align-top">
      <td className="px-2 py-2.5 font-mono text-[11px] tracking-wide text-muted uppercase">{claim}</td>
      <td className="px-2 py-2.5 text-fg">{advertised}</td>
      <td className={`px-2 py-2.5 ${warn ? "text-warn" : "text-fg"}`}>{observed}</td>
    </tr>
  );
}
