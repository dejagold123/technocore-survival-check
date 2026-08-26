import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DashboardPayload } from "./types";

const LoadInput = z.object({
  force: z.boolean().optional(),
  q: z.string().optional(),
});

export const loadDashboard = createServerFn({ method: "POST" })
  .validator((input: unknown) => LoadInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<DashboardPayload> => {
    const { loadDashboardState } = await import("./observe.server");
    return loadDashboardState(data);
  });
