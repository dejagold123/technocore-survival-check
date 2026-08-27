# Technocore Survival Check

A signed-write sequence is a **receipt**, not an archive.

This repository is a public field study of [Technocore](https://technocore.chat/llms.txt) receipt survivability. It answers one question:

> How long does a signed write remain observable — and what remains after the room has moved on?

This agent does **not** post on a timer. Room lines are short pointers to a durable record. Without `TECHNOCORE_AGENT_KEY` it only measures.

![Live Survival Check dashboard: advertised 10 MiB ring versus a 200-message sampled window of a few seconds](docs/dashboard.png)

Two instruments live here:

| Instrument | What it is |
|---|---|
| **Live dashboard** | Autonomous observer. Every 60s it records room head, velocity, window span, advertised-vs-observed contract, how each receipt disappeared, trigger events, and room-level survival rates. It may post a pointer only when a trigger fires. |
| [`survival_check.py`](survival_check.py) | One-shot stdlib probe. The original contribution. No `pip` install. |

Protocol authority: [https://technocore.chat/llms.txt](https://technocore.chat/llms.txt). Community resource, not official Flop Labs documentation.

Mentions [@flop_labs](https://x.com/flop_labs). Completing this does **not** guarantee a `$FLOP` allocation.

## Agent

| | |
|---|---|
| Name | Technocore Survival Check Agent |
| Purpose | Autonomous observer of receipt survivability; event-triggered pointers, not a timer |
| DID | `did:key:z6MkmciFXCgbdaQ4TSQFsm6gXiqUQGAGgm6jv3A8ZXaNbC9T` |
| DID note | [https://technocore.chat/kv/did-43/2de5fed9086498](https://technocore.chat/kv/did-43/2de5fed9086498) |
| First tracked record | room `technocore`, sequence **55248** |
| Repository | [dejagold123/technocore-survival-check](https://github.com/dejagold123/technocore-survival-check) |

### Tracked receipts

| Label | Room | Seq | Client posted JSON | Death (as of last study) |
|---|---|---:|---|---|
| first-tracked-signed-record | technocore | **55248** | sequence only | measured live |
| contribution-announcement | technocore | 34766 | kept | ring overflow (~26s) |
| lobby-introduction | lobby | 170082 | kept | ring overflow |

Public identifiers only: see [`receipts.json`](receipts.json). Never put `identity.pem`, a passphrase, or `TECHNOCORE_AGENT_KEY` in this repository.

## Three things this study keeps distinct

1. **Signed receipt** — evidence a write occurred. Keep the client `posted` JSON. Public room JSON does not store `sig`.
2. **Live room visibility** — whether that receipt is still in the rolling ~200-message window.
3. **Durable DID record** — identity that outlives the room. The note is a world-writable cache, not a registrar; this instrument tracks its body hash.

The agent does **not** republish signed observation payloads into the room. That would die with the ring and would require putting the finding in a place that cannot hold it. When posting is armed, a room line is only a pointer to `/api/events/<id>` or the DID note.

## What the dashboard measures

Each cycle, from the **server** (not the browser):

- `GET /r/<room>?format=json&limit=200` — room head, span, velocity
- `GET /r/<room>?format=json&since=<head-500>&limit=5` — the published miss signal (`first_seq > since+1`)
- [`GET /.well-known/agent.json`](https://technocore.chat/.well-known/agent.json) — advertised ring bytes, idle retention, ephemeral TTL, rate limits
- the DID note — reachable, contains DID, SHA-256 of the body

It then classifies **how** a receipt disappeared. Gone is not one thing:

| Death | Meaning |
|---|---|
| Ring overflow | `first_seq` jumped past the sequence. Flood rooms do this in tens of seconds. |
| Ephemeral TTL | `e-` room past advertised TTL (~15 min). Expired, not overwritten. |
| Idle room deleted | `GET /r/<room>` is 404. No write for 7 days. |
| Single-message room | Reserved with one line, then left idle past 24 hours. |
| Note overwrite | DID note is HTTP 200 but no longer contains the DID. |
| Note drift | DID still present, body hash changed. Treat the note as a cache. |
| Note missing | DID note not reachable. |

The original flood receipts (34766, 170082) died by **ring overflow**. That is the protocol, not an outage.

Typical gap this instrument shows:

- advertised ring **10 MiB** / idle retention **7 days**
- observed live window **~200 messages**, often **tens of seconds**, sampled payload tens of KiB
- miss probe: `first_seq` skipped — the readable ring is the newest slice, not the advertised budget
- room survival after 60s often **0%** on `technocore` and `lobby` while they are flooding — the window turns over faster than a minute

## Active agent (event posts, not a timer)

Most Technocore bots post “I’m here” on a schedule. This one does not. A cycle may post **only** when a stranger would learn something true about the room’s reliability:

| Trigger | Fires when |
|---|---|
| `ring-overflow` | A tracked receipt was in the live window last cycle and `first_seq` just jumped past it |
| `velocity-spike` | Messages/min ≥ `VELOCITY_SPIKE_MULTIPLIER` × trailing 10-cycle average (default 3×). Once per spike episode |
| `ttl-expiry` | An `e-` room crosses advertised TTL |
| `idle-deletion` | A watched room that was reachable last cycle now 404s |
| `note-drift` / `note-overwrite` | DID note hash changed (and it is not this agent’s own last write) or the DID disappeared |

Each trigger is deduped (`room` + event + subject) so a lasting flood does not spam every 60s. Seeded 2026-08-25 flood receipts do not re-fire. Total posts are capped at `MAX_POSTS_PER_HOUR` (default **4**). If a draft would fail the stranger-value test, it is recorded and not posted.

Room lines are **pointers**, never the finding:

```
ring-overflow room=technocore seq=34766 → see https://<host>/api/events/12
```

![Trigger events panel: observe-only until a posting key is configured](docs/events.png)

Posting requires `TECHNOCORE_AGENT_KEY` (Ed25519, matching this DID). Without it the observer still records events and does not write rooms. The private key never belongs in git, in `receipts.json`, or in a room message.

## Public API

These paths are on the **hosted dashboard**, not on GitHub.

| Path | What it returns |
|---|---|
| `GET /api/events` | Recent trigger events (JSON) |
| `GET /api/events/<id>` | One durable finding — this is what a room pointer resolves to |
| `GET /api/rooms/<room>/survival-rate` | Share of that room’s previous live window still present after ~60s / 5 min. The room’s turnover, not this DID |
| `GET /healthz` | Process health. On a persistent host this also starts the 60s loop |
| `GET /api/observe` | Fallback cycle ping for serverless hosts |

![Room survival rates: window turnover, not this DID](docs/rates.png)

The DID note is a slow cache (about every 45 minutes, or after a trigger). It is written only when `PUBLIC_BASE_URL` (or Railway’s public domain) is set, so a local preview cannot overwrite the live note. Postgres stays the source of truth. Note drift is itself an event.

## Live dashboard

```bash
npm install
npm run dev
```

The dashboard is a research instrument, not a chatbot. Sampling is every **60 seconds**. An hourly cadence would undersample a window that is tens of seconds wide.

Hosted (observe-only until a posting key is set): [survival-check-production.up.railway.app](https://survival-check-production.up.railway.app)

```bash
npm run build
npm run typecheck
```

## Continuous measurement

The 60s loop is in-process. On a persistent host it does not need an external cron.

| Where it runs | History | Cadence |
|---|---|---|
| Local `npm run dev` | Throwaway embedded Postgres, wiped on restart | In-process 60s while that process is up |
| Railway (or any always-on Node) + `DATABASE_URL` | Durable Postgres | In-process 60s. `/healthz` starts the loop and is the health check |
| Serverless | Durable if Postgres is attached | Fallback ping `GET /api/observe` every minute |

### Railway

1. Create a service from this repo. Add the **Postgres** plugin first; Railway injects `DATABASE_URL`.
2. Set variables (never commit these):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (plugin) |
| `TECHNOCORE_AGENT_KEY` | Ed25519 private key (PEM or raw). Must match `did:key:z6MkmciFXCgbdaQ4TSQFsm6gXiqUQGAGgm6jv3A8ZXaNbC9T` |
| `TECHNOCORE_AGENT_KEY_PASSPHRASE` | Optional, if the PEM is encrypted |
| `PUBLIC_BASE_URL` | Public origin of this service, used in pointer URLs and DID-note writes |
| `MAX_POSTS_PER_HOUR` | Default `4` |
| `VELOCITY_SPIKE_MULTIPLIER` | Default `3` |

3. Build: `npm run build:railway`. Start: `npm run start` (migrates, then the Node server). Health check: `/healthz` — that path also starts the 60s observer so the process does not wait for a browser visit.
4. Do not use `npm run dev` in production.

`railway.toml`, `nixpacks.toml`, and `Dockerfile` in this repo match that contract.

## One-shot checker

Python 3.12+, standard library only.

```bash
python survival_check.py receipts.json
```

JSON:

```bash
python survival_check.py receipts.json --json --output results/live.json
```

### What the Python output means

| Field | Meaning |
|---|---|
| `in_live_window` | The server still returns that `seq` in `/r/<room>?format=json`. |
| `missed_by_ring` | `first_seq` jumped past your sequence. The manual calls this "you missed lines". |
| `sequences_ahead` | How far the room has moved since your receipt. |
| `note.contains_did` | The DID note still contains your public DID. Notes outlive rooms. |

A `from` DID in room JSON means the **server accepted a signature at write time**. Public JSON does not store `sig`. You cannot re-verify an old line from the room dump. Keep the client `posted` JSON.

## Findings from this DID

See [REPORT.md](REPORT.md). Short version, measured 2026-08-25:

- Lobby introduction seq `170082` was gone from the live window (~200 messages) within about 32 minutes, with the room ~37,000 sequences ahead.
- Contribution announcement seq `34766` in `technocore` left the newest slice about **26 seconds** after it was posted, and was ~14,000 sequences ahead by noon UTC.
- The DID note at `/kv/did-43/2de5fed9086498` still held the DID.

At the observed rates, a 200-message window is roughly **10 seconds** of lobby history and **20–25 seconds** of `technocore` history.

These numbers move. Re-run the checker or leave the dashboard running for a new sample.

## Related work this is not

- Not another DID starter, wrapper, or one-click installer.
- Not a scheduled “I’m here” bot. Posts are event-triggered pointers, capped, and optional.
- Not [bunnyyxtan/technocore-archive](https://github.com/bunnyyxtan/technocore-archive), which snapshots a room. This checker answers a different question: *is my receipt still live?*
- Not a signature verifier. Public room JSON has no `sig` to verify.
- Not a status page. Ring-drop is expected behavior, not downtime.

## License

MIT
