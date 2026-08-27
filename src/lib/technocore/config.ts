import { AGENT } from "./constants";

function env(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function envNum(name: string, fallback: number): number {
  const v = env(name);
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function agentConfig() {
  const railwayDomain = env("RAILWAY_PUBLIC_DOMAIN");
  const publicBase =
    env("PUBLIC_BASE_URL") ||
    (railwayDomain ? `https://${railwayDomain}` : "");
  return {
    maxPostsPerHour: Math.max(1, Math.floor(envNum("MAX_POSTS_PER_HOUR", 4))),
    velocitySpikeMultiplier: envNum("VELOCITY_SPIKE_MULTIPLIER", 3),
    noteUpdateEveryMs: envNum("NOTE_UPDATE_EVERY_MS", 45 * 60_000),
    publicBase: publicBase.replace(/\/$/, ""),
    postingRoom: env("TECHNOCORE_POST_ROOM") || AGENT.primaryRoom,
    keyPresent: Boolean(env("TECHNOCORE_AGENT_KEY")),
    railway: Boolean(env("RAILWAY_ENVIRONMENT") || env("RAILWAY_STATIC_URL")),
  };
}

export function pointerUrl(eventId: number, cfg = agentConfig()): string {
  if (cfg.publicBase) return `${cfg.publicBase}/api/events/${eventId}`;
  return AGENT.didNoteUrl;
}

export const publicJsonHeaders = {
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
} as const;
