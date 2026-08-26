import type { DeathMode, VisibilityStatus } from "./types";

export const DEATH_MODE_COPY: Record<
  DeathMode,
  { label: string; meaning: string }
> = {
  recorded: {
    label: "Recorded",
    meaning: "A sequence is on file. It has not been observed inside the live window by this instrument.",
  },
  still_visible: {
    label: "Still visible",
    meaning: "The receipt is inside the current live window.",
  },
  near_edge: {
    label: "Near window edge",
    meaning: "Still readable, but close to the trailing edge of the ring. The next flood will drop it.",
  },
  ring_overflow: {
    label: "Ring overflow",
    meaning: "first_seq jumped past this sequence. The rolling ring dropped it. This is the flood-room death.",
  },
  ephemeral_ttl: {
    label: "Ephemeral TTL",
    meaning: "The room is an e- class room and the advertised TTL has elapsed. Expired, not overwritten.",
  },
  idle_deleted: {
    label: "Idle room deleted",
    meaning: "GET /r/<room> is gone. Rooms with no write for 7 days are deleted; a room still on its single message goes after 24 hours.",
  },
  single_message_room: {
    label: "Single-message room",
    meaning: "The room was reserved with one line and then left idle past the 24-hour single-message window.",
  },
  note_ok: {
    label: "Note intact",
    meaning: "DID note reachable, contains the DID, body hash unchanged since the last cycle.",
  },
  note_overwrite: {
    label: "Note overwrite",
    meaning: "The DID note is still HTTP 200 but no longer contains this DID. Notes are world-writable caches.",
  },
  note_drift: {
    label: "Note drift",
    meaning: "The DID is still in the note, but the body hash changed. Treat the note as a cache, not a registrar.",
  },
  note_missing: {
    label: "Note missing",
    meaning: "The DID note was not reachable.",
  },
  unknown_gone: {
    label: "Gone (unclassified)",
    meaning: "No longer in the live window, but this cycle could not name the death.",
  },
};

export function classifyReceiptDeath(args: {
  status: VisibilityStatus;
  inWindow: boolean;
  missedByRing: boolean;
  room: string;
  roomHttpError: string | null;
  postedAt: string | null;
  observedAt: string;
  ephemeralTtlSeconds: number | null;
}): { mode: DeathMode; detail: string } {
  const { status, inWindow, missedByRing, room, roomHttpError, postedAt, observedAt, ephemeralTtlSeconds } =
    args;

  if (inWindow && status === "near_edge") {
    return { mode: "near_edge", detail: "Inside the sampled window, within 20% of the trailing edge." };
  }
  if (inWindow) {
    return { mode: "still_visible", detail: "Sequence is present in the current live window." };
  }

  const err = (roomHttpError ?? "").toLowerCase();
  const missingRoom = /http 404/.test(err) || /not found/.test(err);
  if (missingRoom) {
    const ageDays = ageInDays(postedAt, observedAt);
    if (ageDays != null && ageDays < 2) {
      return {
        mode: "single_message_room",
        detail: "Room fetch returned 404 within 48 hours of the write — likely the 24-hour single-message rule.",
      };
    }
    return {
      mode: "idle_deleted",
      detail: "Room fetch returned 404. Idle rooms are deleted after 7 days with no write.",
    };
  }

  if (isEphemeralRoom(room) && ttlElapsed(postedAt, observedAt, ephemeralTtlSeconds)) {
    return {
      mode: "ephemeral_ttl",
      detail: `e- room past advertised TTL (${ephemeralTtlSeconds ?? 900}s). Expired, not ring-dropped.`,
    };
  }

  if (missedByRing) {
    return {
      mode: "ring_overflow",
      detail: "first_seq is greater than this sequence. The published miss signal: you missed lines.",
    };
  }

  if (status === "recorded") {
    return { mode: "recorded", detail: "Tracked, not yet observed live." };
  }

  return { mode: "unknown_gone", detail: "Absent from the sampled window; miss signal not confirmed this cycle." };
}

export function classifyNote(args: {
  reachable: boolean;
  containsDid: boolean;
  sha256: string | null;
  previousSha256: string | null;
}): DeathMode {
  if (!args.reachable) return "note_missing";
  if (!args.containsDid) return "note_overwrite";
  if (args.previousSha256 && args.sha256 && args.previousSha256 !== args.sha256) return "note_drift";
  return "note_ok";
}

function isEphemeralRoom(room: string): boolean {
  return /(^|-)e-/.test(room) || room.startsWith("e-");
}

function ageInDays(postedAt: string | null, observedAt: string): number | null {
  if (!postedAt) return null;
  const a = Date.parse(postedAt);
  const b = Date.parse(observedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 86_400_000;
}

function ttlElapsed(postedAt: string | null, observedAt: string, ttl: number | null): boolean {
  if (!postedAt || !ttl) return false;
  const a = Date.parse(postedAt);
  const b = Date.parse(observedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return (b - a) / 1000 >= ttl;
}
