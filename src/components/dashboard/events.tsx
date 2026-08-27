import { isoToDisplay } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/technocore/types";
import { Section } from "./primitives";

export function EventsPanel({ data }: { data: DashboardPayload }) {
  const events = data.events ?? [];
  return (
    <Section
      n="09"
      title="Trigger events"
      aside={data.postingEnabled ? "posting armed" : "observe-only · no key"}
    >
      <p className="mb-3 max-w-3xl text-sm leading-relaxed text-muted">
        This agent does not post on a timer. A room line is a short pointer to a durable record, and only
        when the room itself just changed in a way a stranger could not guess from “I’m here.”
      </p>
      {events.length === 0 ? (
        <p className="text-sm text-subtle">No trigger events yet. Seeded flood receipts do not re-fire.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="font-mono text-[10px] tracking-wider text-muted uppercase">
              <tr className="border-b border-border">
                <th className="px-2 py-2 font-medium">When</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Room</th>
                <th className="px-2 py-2 font-medium">Pointer</th>
                <th className="px-2 py-2 font-medium">Post</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border/70 align-top">
                  <td className="px-2 py-2 font-mono text-muted whitespace-nowrap">{isoToDisplay(e.created_at)}</td>
                  <td className="px-2 py-2 font-mono text-fg">{e.event_type}</td>
                  <td className="px-2 py-2 font-mono">
                    {e.room}:{e.subject}
                  </td>
                  <td className="px-2 py-2">
                    <a href={`/api/events/${e.id}`} className="text-accent underline-offset-2 hover:underline">
                      /api/events/{e.id}
                    </a>
                    <div className="mt-0.5 font-mono text-[10px] text-subtle">{e.pointer_text}</div>
                  </td>
                  <td className="px-2 py-2 text-muted">
                    {e.posted ? `seq ${e.posted_seq ?? "ok"}` : e.skip_reason ?? "held"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
