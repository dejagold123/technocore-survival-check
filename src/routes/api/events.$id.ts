import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/events/$id")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string } }) => {
        const id = Number(params.id);
        if (!Number.isFinite(id) || id <= 0) {
          const { publicJsonHeaders } = await import("@/lib/technocore/config");
          return Response.json({ error: "invalid id" }, { status: 400, headers: publicJsonHeaders });
        }
        const { getSql } = await import("@/lib/db");
        const { getEvent } = await import("@/lib/technocore/agent.server");
        const { publicJsonHeaders } = await import("@/lib/technocore/config");
        const sql = await getSql();
        const event = await getEvent(sql, id);
        if (!event) {
          return Response.json({ error: "not found" }, { status: 404, headers: publicJsonHeaders });
        }
        let detail: unknown = event.detail;
        try {
          if (typeof detail === "string") detail = JSON.parse(detail);
        } catch {
          /* keep raw */
        }
        return Response.json({ ...event, detail }, { headers: publicJsonHeaders });
      },
    },
  },
});
