import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => {
        const { dbSource, getSql } = await import("@/lib/db");
        const { agentConfig } = await import("@/lib/technocore/config");
        const { AGENT } = await import("@/lib/technocore/constants");
        const { startObserver, observerLoopStarted } = await import(
          "@/lib/technocore/observe.server"
        );
        startObserver();
        try {
          const sql = await getSql();
          const rows = await sql<{ observed_at: string }>`
            select observed_at from observations
            where source = 'agent' and room = ${AGENT.primaryRoom}
            order by observed_at desc
            limit 1
          `;
          return Response.json({
            ok: true,
            persistence: dbSource,
            lastObservationAt: rows[0]?.observed_at ?? null,
            postingEnabled: agentConfig().keyPresent,
            observer: observerLoopStarted() ? "running" : "starting",
          });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : "db" },
            { status: 500 },
          );
        }
      },
    },
  },
});
