import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { loadDashboard } from "@/lib/technocore/functions";
import { OBSERVE_EVERY_MS } from "@/lib/technocore/constants";
import type { DashboardPayload } from "@/lib/technocore/types";
import { isoToDisplay } from "@/lib/utils";
import { StatusDot } from "./primitives";
import { MetricStrip } from "./metrics";
import { LiveObservation } from "./live-panel";
import { ContractPanel } from "./contract";
import { ReceiptTracker } from "./receipts";
import { DeathTaxonomy } from "./deaths";
import { SurvivalTimeline } from "./timeline";
import { VelocityChart } from "./velocity";
import { HistoryTable } from "./history";
import { AgentIdentity } from "./identity";

export function DashboardApp({ initial }: { initial?: DashboardPayload }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["dashboard", q],
    queryFn: () => loadDashboard({ data: { q } }),
    initialData: q === "" ? initial : undefined,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d?.latest) return 4_000;
      if (d.velocity.length < 2) return 8_000;
      return OBSERVE_EVERY_MS;
    },
  });

  const probe = useMutation({
    mutationFn: () => loadDashboard({ data: { force: true, q } }),
    onSuccess: (payload) => {
      qc.setQueryData(["dashboard", q], payload);
    },
  });

  const onSearch = useCallback((value: string) => setQ(value), []);
  const data = query.data;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.22em] text-accent uppercase">
                Field measurement · Technocore
              </p>
              <h1 className="mt-1 text-2xl font-medium tracking-tight text-fg sm:text-3xl">
                Survival Check
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                How long does a signed write remain observable — and what remains after the room has moved
                on?
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {data ? <StatusDot status={data.agent.status} /> : <StatusDot status="calibrating" />}
              <button
                type="button"
                onClick={() => probe.mutate()}
                disabled={probe.isPending}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw className={`size-3.5 ${probe.isPending ? "animate-spin" : ""}`} aria-hidden />
                {probe.isPending ? "Probing room" : "Run observation"}
              </button>
              <p className="font-mono text-[10px] text-subtle">
                {data?.agent.lastObservationAt
                  ? `last cycle ${isoToDisplay(data.agent.lastObservationAt)}`
                  : "no live cycle yet"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        {query.isError ? (
          <div className="rounded-xl bg-gone/10 px-4 py-3 text-sm text-gone">
            {query.error instanceof Error ? query.error.message : "Observation failed."}
          </div>
        ) : null}

        {data ? (
          <>
            <MetricStrip data={data} />
            <LiveObservation data={data} />
            <ContractPanel data={data} />
            <ReceiptTracker data={data} />
            <DeathTaxonomy data={data} />
            <SurvivalTimeline data={data} />
            <VelocityChart data={data} />
            <HistoryTable data={data} onSearch={onSearch} />
            <AgentIdentity data={data} />
          </>
        ) : (
          <LoadingState />
        )}
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Probing Technocore">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-md bg-surface" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-surface" />
      <p className="font-mono text-xs tracking-wide text-muted">Probing live room window…</p>
    </div>
  );
}
