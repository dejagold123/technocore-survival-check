import { getSql } from "@/lib/db";
import {
  AGENT,
  MAX_WINDOW_LIMIT,
  NEAR_EDGE_FRACTION,
  OBSERVE_EVERY_MS,
  QUIET_RATIO,
  SEED_RECEIPTS,
  SPIKE_RATIO,
  STALE_MS,
} from "./constants";
import type {
  DashboardPayload,
  ObservationRow,
  ReceiptCheckRow,
  ReceiptRow,
  VelocityPoint,
  VisibilityStatus,
} from "./types";

type Sql = Awaited<ReturnType<typeof getSql>>;

type RoomPayload = {
  room: string;
  count: number;
  first_seq: number;
  last_seq: number;
  messages: Array<{
    seq: number;
    ts?: string;
    from?: string;
    text?: string;
    nonce?: string | number;
  }>;
};

type NoteProbe = {
  http: number;
  reachable: boolean;
  contains_did: boolean;
  preview: string | null;
};

function iso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return String(v);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  if (v === "t" || v === "true") return true;
  if (v === "f" || v === "false") return false;
  return Boolean(v);
}

async function fetchBytes(url: string, timeoutMs = 18_000): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain;q=0.8",
        "User-Agent": AGENT.userAgent,
      },
      signal: controller.signal,
    });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

async function fetchWithRetry(url: string): Promise<{ status: number; body: string }> {
  try {
    const first = await fetchBytes(url);
    if (first.status >= 500 || first.status === 429) {
      await new Promise((r) => setTimeout(r, 700));
      return fetchBytes(url);
    }
    return first;
  } catch {
    await new Promise((r) => setTimeout(r, 700));
    return fetchBytes(url);
  }
}

async function readRoom(room: string, limit = MAX_WINDOW_LIMIT): Promise<RoomPayload> {
  const url = `${AGENT.baseUrl}/r/${encodeURIComponent(room)}?format=json&limit=${limit}`;
  const { status, body } = await fetchWithRetry(url);
  if (status !== 200) {
    throw new Error(`GET /r/${room} returned HTTP ${status}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`GET /r/${room} was not valid JSON`);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error(`GET /r/${room} JSON was not an object`);
  }
  const p = payload as Record<string, unknown>;
  const messages = Array.isArray(p.messages) ? p.messages : [];
  return {
    room: String(p.room ?? room),
    count: num(p.count) ?? messages.length,
    first_seq: num(p.first_seq) ?? 0,
    last_seq: num(p.last_seq) ?? 0,
    messages: messages.filter((m) => m && typeof m === "object") as RoomPayload["messages"],
  };
}

async function probeNote(): Promise<NoteProbe> {
  try {
    const { status, body } = await fetchWithRetry(AGENT.didNoteUrl);
    const visible = body
      .split("\n")
      .filter((line) => !line.startsWith("!!"))
      .join("\n")
      .trim();
    return {
      http: status,
      reachable: status === 200,
      contains_did: body.includes(AGENT.did),
      preview: visible.slice(0, 500) || null,
    };
  } catch (err) {
    return {
      http: 0,
      reachable: false,
      contains_did: false,
      preview: err instanceof Error ? err.message : "note probe failed",
    };
  }
}

function visibilityStatus(seq: number, first: number, last: number): VisibilityStatus {
  if (seq >= first && seq <= last) {
    const span = Math.max(last - first + 1, 1);
    const fromEdge = seq - first;
    if (fromEdge / span < NEAR_EDGE_FRACTION) return "near_edge";
    return "observable";
  }
  return "gone";
}

function windowVelocity(room: RoomPayload): number | null {
  const msgs = room.messages;
  if (msgs.length < 2) return null;
  const first = msgs[0];
  const last = msgs[msgs.length - 1];
  const t0 = first.ts ? Date.parse(first.ts) : NaN;
  const t1 = last.ts ? Date.parse(last.ts) : NaN;
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;
  const seqDelta = (last.seq ?? 0) - (first.seq ?? 0);
  if (seqDelta <= 0) return null;
  return (seqDelta / ((t1 - t0) / 1000)) * 60;
}

function windowSeconds(span: number | null, velPerMin: number | null): number | null {
  if (!span || !velPerMin || velPerMin <= 0) return null;
  return (span / velPerMin) * 60;
}

function detectAnomaly(
  vel: number | null,
  recent: Array<{ velocity_per_minute: unknown; window_velocity_per_min: unknown }>,
  windowSpan: number | null,
  prevSpan: number | null,
): string | null {
  const flags: string[] = [];
  const series = recent
    .map((r) => num(r.window_velocity_per_min) ?? num(r.velocity_per_minute))
    .filter((n): n is number => n != null && n > 0);
  if (vel != null && series.length >= 3) {
    const sorted = [...series].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? vel;
    if (mid > 0 && vel >= mid * SPIKE_RATIO) flags.push("activity spike");
    if (mid > 0 && vel <= mid * QUIET_RATIO) flags.push("quiet period");
  }
  if (windowSpan != null && prevSpan != null && prevSpan > 0 && windowSpan !== prevSpan) {
    flags.push(`window span changed ${prevSpan} → ${windowSpan}`);
  }
  return flags.length ? flags.join("; ") : null;
}

function conclude(args: {
  primarySeq: number;
  status: VisibilityStatus;
  sequencesAhead: number | null;
  windowSeconds: number | null;
  didOk: boolean;
  probeOk: boolean;
  error?: string | null;
}): string {
  if (!args.probeOk) {
    return `Probe failed (${args.error ?? "unreachable"}). No new measurement of the live window was recorded. Existing receipts remain evidence that a write occurred; they are not an archive of room history.`;
  }
  const did = args.didOk
    ? "A durable DID identity record is still reachable independently of the rolling room."
    : "The DID note was not reachable or no longer contains this agent's DID.";
  if (args.status === "observable") {
    return `Sequence ${args.primarySeq} is still inside the live room window, ${formatAhead(args.sequencesAhead)} behind the current head. At the present rate the window holds about ${formatWin(args.windowSeconds)} of history. ${did}`;
  }
  if (args.status === "near_edge") {
    return `Sequence ${args.primarySeq} is approaching the trailing edge of the live window (${formatAhead(args.sequencesAhead)} behind the head). It is still observable, but the ring is about to drop it. ${did}`;
  }
  return `Sequence ${args.primarySeq} persists as a signed receipt of participation, but is no longer inside the observable room window (${formatAhead(args.sequencesAhead)} behind the head). The live window currently holds about ${formatWin(args.windowSeconds)} of history. ${did}`;
}

function formatAhead(n: number | null): string {
  if (n == null) return "an unknown distance";
  return `${n.toLocaleString("en-US")} sequence${n === 1 ? "" : "s"}`;
}

function formatWin(s: number | null): string {
  if (s == null) return "an unmeasured span";
  if (s < 60) return `${Math.round(s)} seconds`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m} minute${m === 1 ? "" : "s"} ${r} seconds` : `${m} minute${m === 1 ? "" : "s"}`;
}

async function ensureSeeded(sql: Sql): Promise<void> {
  for (const r of SEED_RECEIPTS) {
    await sql`
      insert into tracked_receipts (
        label, room, seq, nonce, posted_at, text_preview, did, source, has_client_receipt,
        last_visible_at, first_missing_at, last_status
      ) values (
        ${r.label}, ${r.room}, ${r.seq}, ${r.nonce}, ${r.posted_at}, ${r.text_preview},
        ${AGENT.did}, ${r.source}, ${r.has_client_receipt},
        ${r.last_visible_at}, ${r.first_missing_at}, ${r.first_missing_at ? "gone" : "recorded"}
      )
      on conflict (room, seq) do update set
        last_visible_at = coalesce(tracked_receipts.last_visible_at, excluded.last_visible_at),
        first_missing_at = case
          when excluded.first_missing_at is null then tracked_receipts.first_missing_at
          when tracked_receipts.first_missing_at is null then excluded.first_missing_at
          else least(tracked_receipts.first_missing_at, excluded.first_missing_at)
        end
    `;
  }

  const [{ count }] = await sql<{ count: number }>`
    select count(*)::int as count from observations where source = 'prior-study'
  `;
  if ((count ?? 0) > 0) return;

  // Real measurements from REPORT.md (2026-08-25 flood). Labeled prior-study,
  // never presented as this agent's own cycles.
  type Prior = {
    at: string;
    room: string;
    first: number | null;
    last: number;
    span: number | null;
    growth: number | null;
    vel: number | null;
    windowSec: number | null;
    conclusion: string;
    cycle: string;
  };
  const priors: Prior[] = [
    {
      at: "2026-08-25T11:32:51Z",
      room: "technocore",
      first: 34872,
      last: 34872,
      span: null,
      growth: null,
      vel: null,
      windowSec: 26,
      cycle: "prior-11:32",
      conclusion:
        "Sequence 34766 had already left the newest slice about 26 seconds after it was posted (first_seq=34872).",
    },
    {
      at: "2026-08-25T11:54:37Z",
      room: "technocore",
      first: null,
      last: 44778,
      span: null,
      growth: 9906,
      vel: (9906 / (22 * 60 + 12)) * 60,
      windowSec: 23,
      cycle: "prior-11:54",
      conclusion:
        "technocore last_seq=44778. Contribution announcement still outside the live window.",
    },
    {
      at: "2026-08-25T11:54:37Z",
      room: "lobby",
      first: null,
      last: 202431,
      span: null,
      growth: null,
      vel: null,
      windowSec: 10,
      cycle: "prior-11:54",
      conclusion: "lobby last_seq=202431 during the flood.",
    },
    {
      at: "2026-08-25T12:00:04Z",
      room: "technocore",
      first: 48988,
      last: 49187,
      span: 200,
      growth: 4409,
      vel: (14305 / (27.6 * 60)) * 60,
      windowSec: 23,
      cycle: "prior-12:00",
      conclusion:
        "Sequence 34766 was 14,305 ahead of the head. A 200-message window held roughly 23 seconds of technocore history.",
    },
    {
      at: "2026-08-25T12:00:04Z",
      room: "lobby",
      first: 207019,
      last: 207218,
      span: 200,
      growth: 4787,
      vel: (37111 / (32.5 * 60)) * 60,
      windowSec: 10,
      cycle: "prior-12:00",
      conclusion:
        "Lobby introduction seq 170082 was 37,111 ahead. A 200-message window held roughly 10 seconds of lobby history.",
    },
  ];

  for (const p of priors) {
    await sql`
      insert into observations (
        observed_at, room, current_seq, previous_seq, sequence_growth,
        velocity_per_minute, window_velocity_per_min, window_first_seq, window_last_seq,
        window_count, window_span, window_seconds, did_note_reachable, did_note_contains_did,
        anomaly, conclusion, probe_ok, source, cycle_key
      ) values (
        ${p.at}, ${p.room}, ${p.last}, null, ${p.growth},
        ${p.vel}, ${p.vel}, ${p.first}, ${p.last},
        ${p.span}, ${p.span}, ${p.windowSec}, true, true,
        null, ${p.conclusion}, true, 'prior-study', ${p.cycle}
      )
    `;
  }
}

function mapObservation(r: Record<string, unknown>): ObservationRow {
  return {
    id: num(r.id) ?? 0,
    observed_at: iso(r.observed_at) ?? "",
    room: String(r.room ?? ""),
    current_seq: num(r.current_seq),
    previous_seq: num(r.previous_seq),
    sequence_growth: num(r.sequence_growth),
    interval_seconds: num(r.interval_seconds),
    velocity_per_minute: num(r.velocity_per_minute),
    window_velocity_per_min: num(r.window_velocity_per_min),
    window_first_seq: num(r.window_first_seq),
    window_last_seq: num(r.window_last_seq),
    window_count: num(r.window_count),
    window_span: num(r.window_span),
    window_seconds: num(r.window_seconds),
    did_note_reachable: bool(r.did_note_reachable),
    did_note_contains_did: bool(r.did_note_contains_did),
    did_note_http: num(r.did_note_http),
    anomaly: r.anomaly == null ? null : String(r.anomaly),
    conclusion: r.conclusion == null ? null : String(r.conclusion),
    probe_ok: bool(r.probe_ok) ?? true,
    error_message: r.error_message == null ? null : String(r.error_message),
    source: String(r.source ?? "agent"),
  };
}

function mapReceipt(r: Record<string, unknown>): ReceiptRow {
  const posted = iso(r.posted_at);
  const missing = iso(r.first_missing_at);
  const lastVisible = iso(r.last_visible_at);
  let survival: number | null = num(r.survival_seconds);
  if (survival == null && posted && missing && lastVisible) {
    const a = Date.parse(posted);
    const b = Date.parse(missing);
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) survival = (b - a) / 1000;
  }
  return {
    id: num(r.id) ?? 0,
    label: String(r.label ?? ""),
    room: String(r.room ?? ""),
    seq: num(r.seq) ?? 0,
    nonce: r.nonce == null ? null : String(r.nonce),
    posted_at: posted,
    text_preview: r.text_preview == null ? null : String(r.text_preview),
    did: String(r.did ?? AGENT.did),
    source: String(r.source ?? ""),
    has_client_receipt: bool(r.has_client_receipt) ?? false,
    last_status: String(r.last_status ?? "recorded"),
    last_visible_at: lastVisible,
    first_missing_at: missing,
    last_sequences_ahead: num(r.last_sequences_ahead),
    last_checked_at: iso(r.last_checked_at),
    survival_seconds: survival,
    in_live_window: bool(r.in_live_window),
  };
}

function mapCheck(r: Record<string, unknown>): ReceiptCheckRow {
  return {
    id: num(r.id) ?? 0,
    observation_id: num(r.observation_id) ?? 0,
    receipt_id: num(r.receipt_id) ?? 0,
    room: String(r.room ?? ""),
    seq: num(r.seq) ?? 0,
    in_live_window: bool(r.in_live_window) ?? false,
    missed_by_ring: bool(r.missed_by_ring) ?? false,
    sequences_ahead: num(r.sequences_ahead),
    window_first_seq: num(r.window_first_seq),
    window_last_seq: num(r.window_last_seq),
    window_span: num(r.window_span),
    visibility_status: String(r.visibility_status ?? "gone"),
    matches_did: bool(r.matches_did),
    survival_seconds: num(r.survival_seconds),
    observed_at: iso(r.observed_at) ?? undefined,
  };
}

let loopStarted = false;
let cycleLock: Promise<unknown> = Promise.resolve();

function enqueueCycle(fn: () => Promise<void>): Promise<void> {
  const run = cycleLock.then(fn, fn);
  cycleLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run.then(
    () => undefined,
    (err) => {
      console.error("[survival-observer]", err);
    },
  );
}

function ensureLoop(): void {
  if (loopStarted) return;
  if (typeof setInterval !== "function") return;
  loopStarted = true;
  setInterval(() => {
    void loadDashboardState({ force: false }).catch((err) => {
      console.error("[survival-observer]", err);
    });
  }, OBSERVE_EVERY_MS);
}

export async function loadDashboardState(input?: {
  force?: boolean;
  q?: string;
}): Promise<DashboardPayload> {
  ensureLoop();
  const sql = await getSql();
  await ensureSeeded(sql);

  const force = input?.force === true;

  const kick = async () => {
    const latestRows = await sql<Record<string, unknown>>`
      select * from observations
      where source = 'agent' and room = ${AGENT.primaryRoom}
      order by observed_at desc
      limit 1
    `;
    const latestAgent = latestRows[0] ? mapObservation(latestRows[0]) : null;
    const stale =
      !latestAgent ||
      !latestAgent.observed_at ||
      Date.now() - Date.parse(latestAgent.observed_at) > STALE_MS;
    if (!force && !stale) return;
    await runCycle(sql, latestAgent);
  };

  if (force) {
    await enqueueCycle(kick);
  } else {
    void enqueueCycle(kick);
  }

  return assemble(sql, input?.q ?? "");
}

async function runCycle(sql: Sql, previous: ObservationRow | null): Promise<void> {
  const observedAt = new Date().toISOString();
  const receipts = await sql<Record<string, unknown>>`
    select * from tracked_receipts order by seq desc
  `;
  const rooms = [...new Set(receipts.map((r) => String(r.room)))];
  const roomData = new Map<string, RoomPayload | { error: string }>();

  await Promise.all(
    rooms.map(async (room) => {
      try {
        roomData.set(room, await readRoom(room));
      } catch (err) {
        roomData.set(room, { error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );

  const note = await probeNote();
  const primary = roomData.get(AGENT.primaryRoom);
  const probeOk = primary != null && !("error" in primary);
  const errorMessage =
    primary && "error" in primary ? primary.error : probeOk ? null : "primary room unread";

  const live = probeOk ? (primary as RoomPayload) : null;
  const currentSeq = live?.last_seq ?? null;
  const previousSeq = previous?.current_seq ?? null;
  const intervalSeconds =
    previous?.observed_at && currentSeq != null
      ? (Date.parse(observedAt) - Date.parse(previous.observed_at)) / 1000
      : null;
  const sequenceGrowth =
    currentSeq != null && previousSeq != null ? currentSeq - previousSeq : null;
  const intervalVel =
    sequenceGrowth != null && intervalSeconds && intervalSeconds > 0
      ? (sequenceGrowth / intervalSeconds) * 60
      : null;
  const winVel = live ? windowVelocity(live) : null;
  const span = live ? live.last_seq - live.first_seq + 1 : null;
  const winSec = windowSeconds(span, winVel ?? intervalVel);

  const recent = await sql<Record<string, unknown>>`
    select velocity_per_minute, window_velocity_per_min, window_span
    from observations
    where source = 'agent' and room = ${AGENT.primaryRoom} and probe_ok = true
    order by observed_at desc
    limit 12
  `;
  const anomaly = live
    ? detectAnomaly(
        winVel ?? intervalVel,
        recent.map((r) => ({
          velocity_per_minute: r.velocity_per_minute,
          window_velocity_per_min: r.window_velocity_per_min,
        })),
        span,
        previous?.window_span ?? null,
      )
    : errorMessage;

  const primaryReceipt = receipts.find(
    (r) => String(r.room) === AGENT.primaryRoom && num(r.seq) === AGENT.firstTracked.seq,
  );
  let primaryStatus: VisibilityStatus = "gone";
  let primaryAhead: number | null = null;
  if (live && primaryReceipt) {
    const seq = num(primaryReceipt.seq) ?? AGENT.firstTracked.seq;
    primaryStatus = visibilityStatus(seq, live.first_seq, live.last_seq);
    primaryAhead = live.last_seq - seq;
  }

  const conclusion = conclude({
    primarySeq: AGENT.firstTracked.seq,
    status: primaryStatus,
    sequencesAhead: primaryAhead,
    windowSeconds: winSec,
    didOk: note.reachable && note.contains_did,
    probeOk,
    error: errorMessage,
  });

  const inserted = await sql<{ id: number }>`
    insert into observations (
      observed_at, room, current_seq, previous_seq, sequence_growth, interval_seconds,
      velocity_per_minute, window_velocity_per_min, window_first_seq, window_last_seq,
      window_count, window_span, window_seconds, did_note_reachable, did_note_contains_did,
      did_note_http, anomaly, conclusion, probe_ok, error_message, source, cycle_key
    ) values (
      ${observedAt}, ${AGENT.primaryRoom}, ${currentSeq}, ${previousSeq}, ${sequenceGrowth},
      ${intervalSeconds}, ${intervalVel}, ${winVel}, ${live?.first_seq ?? null},
      ${live?.last_seq ?? null}, ${live?.count ?? null}, ${span}, ${winSec},
      ${note.reachable}, ${note.contains_did}, ${note.http}, ${anomaly}, ${conclusion},
      ${probeOk}, ${errorMessage}, 'agent', ${observedAt}
    )
    returning id
  `;
  const observationId = num(inserted[0]?.id);
  if (observationId == null) return;

  for (const rec of receipts) {
    const room = String(rec.room);
    const seq = num(rec.seq) ?? 0;
    const snapshot = roomData.get(room);
    const liveRoom = snapshot && !("error" in snapshot) ? snapshot : null;
    const found = liveRoom?.messages.find((m) => m.seq === seq) ?? null;
    const first = liveRoom?.first_seq ?? null;
    const last = liveRoom?.last_seq ?? null;
    const inWindow = found != null || (first != null && last != null && seq >= first && seq <= last);
    const missed = first != null && first > seq && !inWindow;
    const status: VisibilityStatus =
      liveRoom && first != null && last != null ? visibilityStatus(seq, first, last) : "gone";
    const ahead = last != null ? last - seq : null;
    const rSpan = first != null && last != null ? last - first + 1 : null;
    const nonce = rec.nonce == null ? null : String(rec.nonce);
    const matchesDid = found
      ? found.from === AGENT.did && (!nonce || String(found.nonce ?? "") === nonce)
      : null;

    let survival: number | null = null;
    const posted = iso(rec.posted_at);
    let lastVisible = iso(rec.last_visible_at);
    let firstMissing = iso(rec.first_missing_at);
    if (inWindow) {
      lastVisible = observedAt;
    } else if (lastVisible && !firstMissing) {
      firstMissing = observedAt;
    }
    if (posted && lastVisible && firstMissing) {
      const a = Date.parse(posted);
      const b = Date.parse(firstMissing);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) survival = (b - a) / 1000;
    }

    await sql`
      insert into receipt_checks (
        observation_id, receipt_id, room, seq, in_live_window, missed_by_ring,
        sequences_ahead, window_first_seq, window_last_seq, window_span,
        visibility_status, matches_did, survival_seconds
      ) values (
        ${observationId}, ${num(rec.id)}, ${room}, ${seq}, ${inWindow}, ${missed},
        ${ahead}, ${first}, ${last}, ${rSpan}, ${status}, ${matchesDid}, ${survival}
      )
    `;

    await sql`
      update tracked_receipts set
        last_status = ${status},
        last_visible_at = ${lastVisible},
        first_missing_at = ${firstMissing},
        last_sequences_ahead = ${ahead},
        last_checked_at = ${observedAt}
      where id = ${num(rec.id)}
    `;
  }
}

async function assemble(sql: Sql, q: string): Promise<DashboardPayload> {
  const latestRows = await sql<Record<string, unknown>>`
    select * from observations
    where room = ${AGENT.primaryRoom} and source = 'agent'
    order by observed_at desc
    limit 1
  `;
  const latest = latestRows[0] ? mapObservation(latestRows[0]) : null;

  const receiptRows = await sql<Record<string, unknown>>`
    select r.*,
      c.in_live_window,
      c.survival_seconds
    from tracked_receipts r
    left join lateral (
      select in_live_window, survival_seconds
      from receipt_checks
      where receipt_id = r.id
      order by id desc
      limit 1
    ) c on true
    order by r.room = ${AGENT.primaryRoom} desc, r.seq desc
  `;
  const receipts = receiptRows.map(mapReceipt);

  const search = q.trim();
  const observationRows = search
    ? await sql<Record<string, unknown>>`
        select * from observations
        where coalesce(conclusion, '') ilike ${"%" + search + "%"}
           or coalesce(anomaly, '') ilike ${"%" + search + "%"}
           or room ilike ${"%" + search + "%"}
           or cast(id as text) = ${search}
           or cast(current_seq as text) ilike ${"%" + search + "%"}
        order by observed_at desc
        limit 80
      `
    : await sql<Record<string, unknown>>`
        select * from observations
        order by observed_at desc
        limit 80
      `;
  const observations = observationRows.map(mapObservation);

  const velocityRows = await sql<Record<string, unknown>>`
    select id, observed_at, current_seq, sequence_growth, velocity_per_minute,
           window_velocity_per_min, window_seconds, anomaly, probe_ok, source
    from observations
    where room = ${AGENT.primaryRoom}
    order by observed_at asc
    limit 200
  `;
  const velocity: VelocityPoint[] = velocityRows
    .filter((r) => String(r.source) === "agent")
    .map((r) => ({
      id: num(r.id) ?? 0,
      observed_at: iso(r.observed_at) ?? "",
      current_seq: num(r.current_seq),
      sequence_growth: num(r.sequence_growth),
      velocity_per_minute: num(r.velocity_per_minute),
      window_velocity_per_min: num(r.window_velocity_per_min),
      window_seconds: num(r.window_seconds),
      anomaly: r.anomaly == null ? null : String(r.anomaly),
      probe_ok: bool(r.probe_ok) ?? true,
    }));

  const checkRows = await sql<Record<string, unknown>>`
    select c.*, o.observed_at
    from receipt_checks c
    join observations o on o.id = c.observation_id
    order by o.observed_at asc
    limit 400
  `;
  const checksByReceipt: Record<number, ReceiptCheckRow[]> = {};
  for (const row of checkRows) {
    const mapped = mapCheck(row);
    (checksByReceipt[mapped.receipt_id] ??= []).push(mapped);
  }

  let primaryCheck: ReceiptCheckRow | null = null;
  if (latest) {
    const primaryReceipt = receipts.find(
      (r) => r.room === AGENT.primaryRoom && r.seq === AGENT.firstTracked.seq,
    );
    if (primaryReceipt) {
      const rows = await sql<Record<string, unknown>>`
        select c.*, o.observed_at from receipt_checks c
        join observations o on o.id = c.observation_id
        where c.observation_id = ${latest.id} and c.receipt_id = ${primaryReceipt.id}
        limit 1
      `;
      if (rows[0]) primaryCheck = mapCheck(rows[0]);
    }
  }

  const noteRow = await sql<Record<string, unknown>>`
    select conclusion from observations
    where source = 'agent' and did_note_contains_did is not null
    order by observed_at desc
    limit 1
  `;
  void noteRow;

  const lastAgent = observations.find((o) => o.source === "agent" && o.room === AGENT.primaryRoom);
  const lastAt = lastAgent?.observed_at ?? latest?.observed_at ?? null;
  let status: DashboardPayload["agent"]["status"] = "idle";
  if (lastAgent && !lastAgent.probe_ok) status = "error";
  else if (lastAgent && lastAgent.velocity_per_minute == null && lastAgent.window_velocity_per_min == null)
    status = "calibrating";
  else if (lastAgent) status = "observing";

  const nextDueAt = lastAt ? new Date(Date.parse(lastAt) + OBSERVE_EVERY_MS).toISOString() : null;

  return {
    agent: {
      name: AGENT.name,
      purpose: AGENT.purpose,
      did: AGENT.did,
      repo: AGENT.repo,
      protocol: AGENT.protocol,
      didNoteUrl: AGENT.didNoteUrl,
      primaryRoom: AGENT.primaryRoom,
      firstTrackedSeq: AGENT.firstTracked.seq,
      status,
      lastObservationAt: lastAt,
      nextDueAt,
    },
    latest,
    primaryCheck,
    receipts,
    observations,
    velocity,
    checksByReceipt,
    didNotePreview: null,
    generatedAt: new Date().toISOString(),
  };
}
