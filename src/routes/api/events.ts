import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
        const { getSql } = await import("@/lib/db");
        const { listEvents } = await import("@/lib/technocore/agent.server");
        const { publicJsonHeaders } = await import("@/lib/technocore/config");
        const sql = await getSql();
        const events = await listEvents(sql, limit);
        return Response.json({ events }, { headers: publicJsonHeaders });
      },
    },
  },
});
