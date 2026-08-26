import { formatSeq } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/technocore/types";
import { Section } from "./primitives";

export function SurvivalTimeline({ data }: { data: DashboardPayload }) {
  const now = Date.parse(data.generatedAt) || 0;
  const postedTimes = data.receipts
    .map((r) => (r.posted_at ? Date.parse(r.posted_at) : NaN))
    .filter((t) => Number.isFinite(t));
  const start = postedTimes.length ? Math.min(...postedTimes) : now - 6 * 3600_000;
  const range = Math.max(now - start, 1);
  const pct = (t: number) => `${(((t - start) / range) * 100).toFixed(3)}%`;
  const width = (a: number, b: number) =>
    `${((Math.max(b - a, 0) / range) * 100).toFixed(3)}%`;

  return (
    <Section n="03" title="Survival timeline" aside="when receipts entered and left the observable window">
      <div className="flex flex-col gap-4">
        {data.receipts.map((r) => {
          const posted = r.posted_at ? Date.parse(r.posted_at) : null;
          const goneAt = r.first_missing_at ? Date.parse(r.first_missing_at) : null;
          const visibleEnd =
            goneAt && Number.isFinite(goneAt)
              ? goneAt
              : r.last_status === "gone"
                ? posted ?? start
                : now;
          const sliver =
            posted && visibleEnd > posted
              ? Math.max(((visibleEnd - posted) / range) * 100, 0.35).toFixed(3)
              : "0";
          return (
            <div key={r.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-xs text-fg">
                  {r.label.replace(/-/g, " ")}{" "}
                  <span className="font-mono text-muted">
                    {r.room}:{formatSeq(r.seq)}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-subtle">
                  {posted ? "posted → now" : "no original timestamp"}
                </span>
              </div>
              <div className="relative h-6 overflow-hidden rounded-sm bg-surface-2">
                {posted ? (
                  <>
                    <div
                      className="absolute inset-y-0 bg-live/80"
                      style={{ left: pct(posted), width: `${sliver}%` }}
                      title="Observable interval"
                    />
                    <div
                      className="absolute inset-y-0 bg-gone/40"
                      style={{ left: pct(visibleEnd), width: width(visibleEnd, now) }}
                      title="No longer visible"
                    />
                  </>
                ) : (
                  <div className="absolute inset-y-1 left-1 right-1 rounded-sm bg-gone/25" />
                )}
                <div className="absolute inset-y-0 right-0 w-px bg-accent" title="now" />
              </div>
            </div>
          );
        })}
        <div className="flex justify-between font-mono text-[10px] tracking-wider text-subtle uppercase">
          <span>earliest receipt</span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <i className="inline-block size-2 rounded-sm bg-live/70" /> observable
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block size-2 rounded-sm bg-gone/35" /> no longer visible
            </span>
          </span>
          <span>now</span>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Under flood, the observable interval is a sliver against the hours that follow. The bar makes that
          ratio visible: a signed write is a receipt of participation, not an archive of room history.
        </p>
      </div>
    </Section>
  );
}
