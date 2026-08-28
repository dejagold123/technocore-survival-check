import { createHash } from "node:crypto";
import { AGENT } from "./constants";
import { agentConfig, pointerUrl } from "./config";
import { getAgentKey, nextNonce, signPayload, sweepText } from "./sign.server";
import type { DeathMode, ObservationRow, VisibilityStatus } from "./types";

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
};

export type RoomLive = {
  room: string;
  first_seq: number;
  last_seq: number;
  count: number;
  bytes: number;
  velocity: number | null;
};

export type CycleRoom = RoomLive | { room: string; error: string };

export type ReceiptTransition = {
  room: string;
  seq: number;
  previousStatus: string;
  status: VisibilityStatus | string;
  deathMode: DeathMode | string;
  missedByRing: boolean;
  inWindow: boolean;
};

export type CycleContext = {
  sql: Sql;
  observedAt: string;
  observationId: number;
  rooms: CycleRoom[];
  previous: ObservationRow | null;
  receipts: ReceiptTransition[];
  note: {
    reachable: boolean;
    containsDid: boolean;
    sha256: string | null;
    mode: string | null;
    body: string | null;
  };
  primaryVelocity: number | null;
};

export type AgentEventRow = {
  id: number;
  created_at: string;
  event_type: string;
  room: string;
  subject: string;
  title: string;
  pointer_text: string;
  detail: string | null;
  posted: boolean;
  posted_seq: number | null;
  skip_reason: string | null;
};

export type SurvivalRate = {
  room: string;
  asOf: string;
  windowSpan: number | null;
  velocityPerMinute: number | null;
  survive60s: number | null;
  survive5min: number | null;
  trailingHour60s: number | null;
  samples: number;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function iso(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : v;
  }
  return String(v);
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return hi >= lo ? hi - lo + 1 : 0;
}

async function getState(sql: Sql, key: string): Promise<string | null> {
  const rows = await sql<{ value: string | null }>`select value from agent_state where key = ${key}`;
  return rows[0]?.value ?? null;
}

async function setState(sql: Sql, key: string, value: string): Promise<void> {
  await sql`
    insert into agent_state (key, value, updated_at) values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function recordRoomSnapshots(ctx: CycleContext): Promise<void> {
  for (const r of ctx.rooms) {
    if ("error" in r) {
      await ctx.sql`
        insert into room_snapshots (
          observation_id, observed_at, room, probe_ok, http_error
        ) values (
          ${ctx.observationId}, ${ctx.observedAt}, ${r.room}, false, ${r.error}
        )
      `;
      continue;
    }
    await ctx.sql`
      insert into room_snapshots (
        observation_id, observed_at, room, first_seq, last_seq, window_count, window_span,
        window_bytes, velocity_per_minute, probe_ok
      ) values (
        ${ctx.observationId}, ${ctx.observedAt}, ${r.room}, ${r.first_seq}, ${r.last_seq},
        ${r.count}, ${r.last_seq - r.first_seq + 1}, ${r.bytes}, ${r.velocity}, true
      )
    `;
  }
}

type Draft = {
  eventType: string;
  room: string;
  subject: string;
  dedupeKey: string;
  title: string;
  detail: Record<string, unknown>;
  postRoom: string;
};

function draftPointer(eventType: string, room: string, subject: string, url: string): string {
  return `${eventType} room=${room} seq=${subject} → see ${url}`;
}

async function detectDrafts(ctx: CycleContext): Promise<Draft[]> {
  const cfg = agentConfig();
  const drafts: Draft[] = [];
  const postRoom = cfg.postingRoom;

  for (const rec of ctx.receipts) {
    const wasLive = rec.previousStatus === "observable" || rec.previousStatus === "near_edge";
    if (wasLive && !rec.inWindow && rec.missedByRing) {
      drafts.push({
        eventType: "ring-overflow",
        room: rec.room,
        subject: String(rec.seq),
        dedupeKey: `ring_overflow:${rec.room}:${rec.seq}`,
        title: `ring overflow in ${rec.room} seq ${rec.seq}`,
        detail: { seq: rec.seq, previousStatus: rec.previousStatus, deathMode: rec.deathMode },
        postRoom: rec.room === "lobby" || rec.room === AGENT.primaryRoom ? rec.room : postRoom,
      });
    }
    if (wasLive && rec.deathMode === "ephemeral_ttl") {
      drafts.push({
        eventType: "ttl-expiry",
        room: rec.room,
        subject: String(rec.seq),
        dedupeKey: `ttl:${rec.room}:${rec.seq}`,
        title: `ephemeral TTL crossed in ${rec.room} seq ${rec.seq}`,
        detail: { seq: rec.seq, deathMode: rec.deathMode },
        postRoom,
      });
    }
  }

  for (const r of ctx.rooms) {
    if ("error" in r && /http 404/i.test(r.error)) {
      const prev = await ctx.sql<{ probe_ok: boolean | string | null }>`
        select probe_ok from room_snapshots
        where room = ${r.room} and observation_id is distinct from ${ctx.observationId}
        order by observed_at desc
        limit 1
      `;
      const wasLive = prev[0]?.probe_ok === true || prev[0]?.probe_ok === "t";
      if (!wasLive) continue;
      drafts.push({
        eventType: "idle-deletion",
        room: r.room,
        subject: r.room,
        dedupeKey: `idle_deleted:${r.room}:${ctx.observedAt.slice(0, 13)}`,
        title: `room ${r.room} is gone (404)`,
        detail: { error: r.error },
        postRoom,
      });
    }
  }

  if (ctx.note.mode === "note_overwrite") {
    drafts.push({
      eventType: "note-overwrite",
      room: AGENT.primaryRoom,
      subject: "did-note",
      dedupeKey: `note_overwrite:${ctx.note.sha256 ?? "none"}`,
      title: "DID note no longer contains this agent DID",
      detail: { sha256: ctx.note.sha256, mode: ctx.note.mode },
      postRoom,
    });
  } else if (ctx.note.mode === "note_drift") {
    const lastWritten = await getState(ctx.sql, "last_note_sha");
    if (ctx.note.sha256 && ctx.note.sha256 !== lastWritten) {
      drafts.push({
        eventType: "note-drift",
        room: AGENT.primaryRoom,
        subject: ctx.note.sha256,
        dedupeKey: `note_drift:${ctx.note.sha256}`,
        title: "DID note body hash changed",
        detail: { sha256: ctx.note.sha256, lastWritten },
        postRoom,
      });
    }
  }

  if (ctx.primaryVelocity != null && ctx.primaryVelocity > 0) {
    const recent = await ctx.sql<{ v: number | null }>`
      select coalesce(window_velocity_per_min, velocity_per_minute) as v
      from observations
      where source = 'agent' and room = ${AGENT.primaryRoom} and probe_ok = true
        and coalesce(window_velocity_per_min, velocity_per_minute) is not null
        and id is distinct from ${ctx.observationId}
      order by observed_at desc
      limit 10
    `;
    const vals = recent.map((row) => num(row.v)).filter((n): n is number => n != null && n > 0);
    if (vals.length >= 5) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const spike = avg > 0 && ctx.primaryVelocity >= avg * cfg.velocitySpikeMultiplier;
      const flag = await getState(ctx.sql, "spike_active:technocore");
      if (spike && flag !== "1") {
        drafts.push({
          eventType: "velocity-spike",
          room: AGENT.primaryRoom,
          subject: String(Math.round(ctx.primaryVelocity)),
          dedupeKey: `velocity_spike:${AGENT.primaryRoom}:${ctx.observedAt.slice(0, 13)}`,
          title: `velocity spike in ${AGENT.primaryRoom}`,
          detail: { velocity: ctx.primaryVelocity, trailingAvg: avg, multiplier: cfg.velocitySpikeMultiplier },
          postRoom: AGENT.primaryRoom,
        });
        await setState(ctx.sql, "spike_active:technocore", "1");
      } else if (!spike && flag === "1" && ctx.primaryVelocity < avg * 1.5) {
        await setState(ctx.sql, "spike_active:technocore", "0");
      }
    }
  }

  return drafts;
}

async function postsLastHour(sql: Sql): Promise<number> {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from agent_posts
    where created_at > now() - interval '1 hour'
  `;
  return rows[0]?.n ?? 0;
}

async function postSigned(room: string, text: string): Promise<{ status: number; body: string; seq: number | null }> {
  const agent = getAgentKey();
  if (!agent || !agent.matchesConfiguredDid) {
    return { status: 0, body: "posting key not configured or DID mismatch", seq: null };
  }
  const swept = sweepText(text);
  const nonce = nextNonce();
  const payload = `${room}|${nonce}|${swept}`;
  const sig = signPayload(payload, agent.key);
  const res = await fetch(`${AGENT.baseUrl}/r/${encodeURIComponent(room)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/plain;q=0.8",
      "user-agent": AGENT.userAgent,
    },
    body: JSON.stringify({ did: agent.did, sig, nonce, text: swept }),
  });
  const body = await res.text();
  let seq: number | null = null;
  try {
    const json = JSON.parse(body) as { seq?: unknown; posted?: { seq?: unknown } };
    seq = num(json.seq) ?? num(json.posted?.seq);
  } catch {
    const m = body.match(/seq[=:]?\s*(\d+)/i);
    if (m) seq = Number(m[1]);
  }
  return { status: res.status, body: body.slice(0, 500), seq };
}

export async function processTriggers(ctx: CycleContext): Promise<{ posted: number; recorded: number }> {
  const cfg = agentConfig();
  const drafts = await detectDrafts(ctx);
  let posted = 0;
  let recorded = 0;
  let hourCount = await postsLastHour(ctx.sql);

  for (const d of drafts) {
    const existing = await ctx.sql<{ id: number }>`
      select id from agent_events where dedupe_key = ${d.dedupeKey} limit 1
    `;
    if (existing[0]) continue;

    const inserted = await ctx.sql<{ id: number }>`
      insert into agent_events (
        event_type, room, subject, dedupe_key, title, pointer_text, detail, observation_id
      ) values (
        ${d.eventType}, ${d.room}, ${d.subject}, ${d.dedupeKey}, ${d.title},
        ${`${d.eventType} room=${d.room} seq=${d.subject}`},
        ${JSON.stringify(d.detail)}, ${ctx.observationId}
      )
      returning id
    `;
    const id = inserted[0]?.id;
    if (id == null) continue;
    recorded += 1;
    const url = pointerUrl(id, cfg);
    const pointer = draftPointer(d.eventType, d.room, d.subject, url);
    await ctx.sql`update agent_events set pointer_text = ${pointer} where id = ${id}`;

    const strangerTest = d.eventType !== "heartbeat" && d.eventType !== "hello";
    if (!strangerTest) {
      await ctx.sql`update agent_events set skip_reason = ${"failed stranger-value test"} where id = ${id}`;
      console.log("[survival-agent] skip (not useful)", d.title);
      continue;
    }

    if (!cfg.keyPresent) {
      await ctx.sql`update agent_events set skip_reason = ${"no TECHNOCORE_AGENT_KEY"} where id = ${id}`;
      console.log("[survival-agent] recorded, not posted (no key):", pointer);
      continue;
    }

    if (hourCount >= cfg.maxPostsPerHour) {
      await ctx.sql`update agent_events set skip_reason = ${"hourly post cap"} where id = ${id}`;
      console.log("[survival-agent] recorded, capped:", pointer);
      continue;
    }

    const target = /http 404/i.test(JSON.stringify(d.detail)) ? cfg.postingRoom : d.postRoom;
    const result = await postSigned(target, pointer);
    await ctx.sql`
      insert into agent_posts (event_id, room, text, http_status, response_preview, seq)
      values (${id}, ${target}, ${pointer}, ${result.status}, ${result.body}, ${result.seq})
    `;
    hourCount += 1;
    if (result.status >= 200 && result.status < 300) {
      posted += 1;
      await ctx.sql`
        update agent_events set posted = true, posted_seq = ${result.seq}, posted_at = now()
        where id = ${id}
      `;
      console.log("[survival-agent] posted", pointer, "seq", result.seq);
    } else {
      await ctx.sql`update agent_events set skip_reason = ${`http ${result.status}`} where id = ${id}`;
      console.error("[survival-agent] post failed", result.status, result.body);
    }
  }
  return { posted, recorded };
}

function noteBody(rates: SurvivalRate[], cfg = agentConfig()): string {
  const lines = [
    AGENT.did,
    "technocore-survival-check",
    `updated ${new Date().toISOString()}`,
  ];
  for (const r of rates.slice(0, 4)) {
    const s60 = r.survive60s == null ? "n/a" : `${Math.round(r.survive60s * 100)}%`;
    lines.push(`${r.room} window=${r.windowSpan ?? "?"} survive60s=${s60}`);
  }
  if (cfg.publicBase) {
    lines.push(`events ${cfg.publicBase}/api/events`);
    lines.push(`observe ${cfg.publicBase}/api/observe`);
  }
  lines.push(`note ${AGENT.didNoteUrl}`);
  return lines.join("\n").slice(0, 8000);
}

async function readCurrentNoteValue(): Promise<string | null> {
  try {
    const res = await fetch(AGENT.didNoteUrl, {
      headers: { accept: "text/plain, application/json;q=0.8", "user-agent": AGENT.userAgent },
    });
    if (!res.ok) return null;
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { value?: unknown };
      if (typeof json.value === "string") return json.value;
    } catch {
      // Not JSON — the KV store returns the raw value as plain text.
    }
    return text;
  } catch (err) {
    console.error("[survival-agent] failed to re-read DID note after conflict", err);
    return null;
  }
}

async function writeDidNote(sql: Sql, body: string): Promise<{ status: number; sha: string }> {
  const sha = createHash("sha256").update(body, "utf8").digest("hex");
  const url = new URL(AGENT.didNoteUrl);
  const parts = url.pathname.split("/").filter(Boolean); // kv, did-43, key
  const ns = parts[1];
  const key = parts[2];

  async function attempt(ifValue: string | null): Promise<{ res: Response; text: string }> {
    const payload: Record<string, unknown> = { value: body };
    if (ifValue) payload.if = ifValue;
    const res = await fetch(`${AGENT.baseUrl}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/plain, application/json;q=0.8",
        "user-agent": AGENT.userAgent,
      },
      body: JSON.stringify(payload),
    });
    return { res, text: await res.text() };
  }

  const cachedBase = await getState(sql, "last_note_body");
  let { res, text } = await attempt(cachedBase);
  console.log("[survival-agent] DID note write", res.status, text.slice(0, 160));

  if (res.status === 409) {
    // Our cached base value is stale relative to the live note — read the
    // actual current value the server holds and retry once with that as
    // the base, instead of resending the same doomed `if` forever.
    const current = await readCurrentNoteValue();
    if (current != null && current !== cachedBase) {
      await setState(sql, "last_note_body", current);
      await setState(sql, "last_note_sha", createHash("sha256").update(current, "utf8").digest("hex"));
      ({ res, text } = await attempt(current));
      console.log("[survival-agent] DID note write retry", res.status, text.slice(0, 160));
    }
  }

  if (res.status >= 200 && res.status < 300) {
    await setState(sql, "last_note_body", body);
    await setState(sql, "last_note_sha", sha);
    await setState(sql, "last_note_at", new Date().toISOString());
    await setState(sql, "note_write_failures", "0");
  } else {
    // Back off exponentially (capped at 30 min) instead of retrying every
    // single ~60s poll cycle while the conflict persists.
    const failures = (Number(await getState(sql, "note_write_failures")) || 0) + 1;
    await setState(sql, "note_write_failures", String(failures));
    const backoffMs = Math.min(30 * 60_000, 60_000 * 2 ** Math.min(failures, 5));
    await setState(sql, "note_write_backoff_until", new Date(Date.now() + backoffMs).toISOString());
  }
  return { status: res.status, sha };
}

export async function maybeRefreshNote(ctx: CycleContext, reasonCount: number): Promise<void> {
  const cfg = agentConfig();
  // Preview / missing public origin must not overwrite the world-writable DID note.
  if (!cfg.publicBase) return;
  const backoffUntil = await getState(ctx.sql, "note_write_backoff_until");
  if (backoffUntil && Date.now() < Date.parse(backoffUntil)) return;
  const last = await getState(ctx.sql, "last_note_at");
  const due =
    reasonCount > 0 ||
    !last ||
    Date.now() - Date.parse(last) > cfg.noteUpdateEveryMs;
  if (!due) return;
  const rooms = [...new Set(ctx.rooms.map((r) => r.room))];
  const rates: SurvivalRate[] = [];
  for (const room of rooms) {
    rates.push(await survivalRateFor(ctx.sql, room));
  }
  const body = noteBody(rates, cfg);
  try {
    await writeDidNote(ctx.sql, body);
  } catch (err) {
    console.error("[survival-agent] DID note update failed", err);
  }
}

export async function survivalRateFor(sql: Sql, room: string): Promise<SurvivalRate> {
  const latest = await sql<Record<string, unknown>>`
    select * from room_snapshots where room = ${room} and probe_ok = true
    order by observed_at desc limit 1
  `;
  const nowRow = latest[0];
  const asOf = nowRow?.observed_at ? iso(nowRow.observed_at) : new Date().toISOString();
  const nowFirst = num(nowRow?.first_seq);
  const nowLast = num(nowRow?.last_seq);

  async function rateAt(agoMs: number): Promise<number | null> {
    if (nowFirst == null || nowLast == null) return null;
    // Accept a snapshot 75% of the way to the target (a 60s cycle that ran at 51s still counts).
    const minAgo = Math.floor(agoMs * 0.75);
    const rows = await sql<Record<string, unknown>>`
      select first_seq, last_seq, observed_at from room_snapshots
      where room = ${room} and probe_ok = true
        and observed_at <= ${new Date(Date.parse(asOf) - minAgo).toISOString()}
      order by observed_at desc
      limit 1
    `;
    const then = rows[0];
    const a0 = num(then?.first_seq);
    const a1 = num(then?.last_seq);
    if (a0 == null || a1 == null) return null;
    const span = a1 - a0 + 1;
    if (span <= 0) return null;
    return overlap(a0, a1, nowFirst, nowLast) / span;
  }

  const hour = await sql<Record<string, unknown>>`
    select first_seq, last_seq, observed_at from room_snapshots
    where room = ${room} and probe_ok = true
      and observed_at >= ${new Date(Date.parse(asOf) - 3600_000).toISOString()}
    order by observed_at asc
  `;
  const hourRates: number[] = [];
  for (let i = 0; i < hour.length; i++) {
    const then = hour[i];
    const later = hour.find((row) => Date.parse(iso(row.observed_at)) >= Date.parse(iso(then.observed_at)) + 45_000);
    const a0 = num(then.first_seq);
    const a1 = num(then.last_seq);
    const b0 = num(later?.first_seq);
    const b1 = num(later?.last_seq);
    if (a0 == null || a1 == null || b0 == null || b1 == null) continue;
    const span = a1 - a0 + 1;
    if (span > 0) hourRates.push(overlap(a0, a1, b0, b1) / span);
  }

  return {
    room,
    asOf,
    windowSpan: nowFirst != null && nowLast != null ? nowLast - nowFirst + 1 : null,
    velocityPerMinute: num(nowRow?.velocity_per_minute),
    survive60s: await rateAt(60_000),
    survive5min: await rateAt(300_000),
    trailingHour60s: hourRates.length ? hourRates.reduce((a, b) => a + b, 0) / hourRates.length : null,
    samples: hour.length,
  };
}

export async function listEvents(sql: Sql, limit = 50): Promise<AgentEventRow[]> {
  const rows = await sql<Record<string, unknown>>`
    select id, created_at, event_type, room, subject, title, pointer_text, detail,
           posted, posted_seq, skip_reason
    from agent_events
    order by id desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    id: num(r.id) ?? 0,
    created_at: iso(r.created_at),
    event_type: String(r.event_type ?? ""),
    room: String(r.room ?? ""),
    subject: String(r.subject ?? ""),
    title: String(r.title ?? ""),
    pointer_text: String(r.pointer_text ?? ""),
    detail: r.detail == null ? null : String(r.detail),
    posted: r.posted === true || r.posted === "t",
    posted_seq: num(r.posted_seq),
    skip_reason: r.skip_reason == null ? null : String(r.skip_reason),
  }));
}

export async function getEvent(sql: Sql, id: number): Promise<AgentEventRow | null> {
  const found = await sql<Record<string, unknown>>`
    select id, created_at, event_type, room, subject, title, pointer_text, detail,
           posted, posted_seq, skip_reason
    from agent_events where id = ${id} limit 1
  `;
  if (!found[0]) return null;
  const r = found[0];
  return {
    id: num(r.id) ?? 0,
    created_at: iso(r.created_at),
    event_type: String(r.event_type ?? ""),
    room: String(r.room ?? ""),
    subject: String(r.subject ?? ""),
    title: String(r.title ?? ""),
    pointer_text: String(r.pointer_text ?? ""),
    detail: r.detail == null ? null : String(r.detail),
    posted: r.posted === true || r.posted === "t",
    posted_seq: num(r.posted_seq),
    skip_reason: r.skip_reason == null ? null : String(r.skip_reason),
  };
}

export async function afterCycle(ctx: CycleContext): Promise<void> {
  await recordRoomSnapshots(ctx);
  const { posted, recorded } = await processTriggers(ctx);
  if (recorded || posted) {
    console.log(`[survival-agent] cycle events recorded=${recorded} posted=${posted}`);
  }
  await maybeRefreshNote(ctx, posted + recorded);
}
