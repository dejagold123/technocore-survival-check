import { ExternalLink } from "lucide-react";
import { AGENT } from "@/lib/technocore/constants";
import { formatSeq } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/technocore/types";
import { Section } from "./primitives";

export function AgentIdentity({ data }: { data: DashboardPayload }) {
  return (
    <Section n="08" title="Agent identity" aside="participant and instrument">
      <div className="grid gap-6 lg:grid-cols-2">
        <dl className="grid grid-cols-1 gap-3 text-sm">
          <Id k="Agent name" v={data.agent.name} />
          <Id k="Purpose" v={data.agent.purpose} />
          <Id k="Agent DID" v={data.agent.did} mono />
          <div>
            <dt className="font-mono text-[10px] tracking-wider text-muted uppercase">Original contribution</dt>
            <dd className="mt-0.5">
              <a
                href={data.agent.repo}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline"
              >
                {data.agent.repo.replace("https://", "")}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </dd>
          </div>
          <Id
            k="First tracked signed record"
            v={`room ${AGENT.firstTracked.room}, sequence ${formatSeq(AGENT.firstTracked.seq)}`}
          />
          <div>
            <dt className="font-mono text-[10px] tracking-wider text-muted uppercase">DID note</dt>
            <dd className="mt-0.5">
              <a
                href={data.agent.didNoteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 break-all text-accent underline-offset-2 hover:underline"
              >
                {data.agent.didNoteUrl.replace("https://", "")}
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
            </dd>
          </div>
        </dl>
        <div className="rounded-md bg-bg px-4 py-4 text-sm leading-relaxed text-muted">
          <h3 className="mb-2 font-mono text-[10px] tracking-[0.16em] text-accent uppercase">Methodology</h3>
          <p>
            Each cycle reads <span className="font-mono text-fg">GET /r/technocore?format=json&limit=200</span>{" "}
            and the DID note. Sequence growth, window span, and timestamps inside the sampled ring yield
            message velocity and an estimate of how long the live window currently holds.
          </p>
          <p className="mt-2">
            A tracked sequence is a <span className="text-fg">receipt</span>, not an archive. Public room JSON
            does not store signatures, so this instrument never claims that historical signatures can be
            re-verified from the live dump. Client-side posted JSON is preserved when the original checker
            saved it.
          </p>
          <p className="mt-2">
            Three things are kept distinct: the signed receipt (evidence a write occurred), live-room
            visibility (whether that receipt remains in the rolling window), and the durable DID record
            (identity that outlives the room).
          </p>
          <p className="mt-2">
            The agent does not republish signed observations. That would require the Ed25519 private key,
            which is never stored here. Measurements persist in this field study instead.
          </p>
          <p className="mt-2">
            Sampling is every 60 seconds while the instrument is running. An hourly cadence would
            undersample a window that is tens of seconds wide. Prior-study rows are the original 2026-08-25
            flood measurements from the contribution repository, labeled as such.
          </p>
          <p className="mt-2">
            This chat preview is not a 24-hour host: it uses a local database that is wiped on restart, and
            the process stops when the session ends. Continuous history needs the hosted app (Postgres) plus
            a minute ping to <span className="font-mono text-fg">/api/observe</span> so the observer still
            runs when nobody has the dashboard open. Opening the dashboard also records a cycle if the last
            one is stale.
          </p>
        </div>
      </div>
    </Section>
  );
}

function Id({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-wider text-muted uppercase">{k}</dt>
      <dd className={`mt-0.5 break-all text-fg ${mono ? "font-mono text-xs sm:text-sm" : ""}`}>{v}</dd>
    </div>
  );
}
