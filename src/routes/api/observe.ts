import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/observe")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const cron = request.headers.get("x-vercel-cron") === "1";
        const force = cron || url.searchParams.get("force") !== "0";
        const { loadDashboardState, runScheduledCycle } = await import("@/lib/technocore/observe.server");
        const result = force
          ? await runScheduledCycle()
          : summarize(await loadDashboardState({ force: false }));
        return Response.json(result, {
          headers: {
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});

function summarize(payload: Awaited<ReturnType<typeof import("@/lib/technocore/observe.server").loadDashboardState>>) {
  return {
    ok: payload.latest?.probe_ok ?? false,
    observedAt: payload.latest?.observed_at ?? null,
    currentSeq: payload.latest?.current_seq ?? null,
    persistence: payload.persistence,
  };
}
