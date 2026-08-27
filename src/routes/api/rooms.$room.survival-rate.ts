import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/rooms/$room/survival-rate")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { room: string } }) => {
        const room = params.room;
        if (!/^[a-z0-9][a-z0-9_-]{0,47}$/i.test(room)) {
          return Response.json({ error: "invalid room" }, { status: 400 });
        }
        const { getSql } = await import("@/lib/db");
        const { survivalRateFor } = await import("@/lib/technocore/agent.server");
        const { publicJsonHeaders } = await import("@/lib/technocore/config");
        const sql = await getSql();
        const rate = await survivalRateFor(sql, room);
        return Response.json(rate, { headers: publicJsonHeaders });
      },
    },
  },
});
