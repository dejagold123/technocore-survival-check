#!/usr/bin/env python3
"""Check whether a Technocore signed-write receipt is still in the live room window.

A sequence number is a server-assigned receipt, not an archive. This tool probes
the public HTTP API and reports whether that receipt is still readable, whether
the ring has already dropped it, and whether a DID note still exists.

Stdlib only. Protocol authority: https://technocore.chat/llms.txt
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit

USER_AGENT = "technocore-survival-check/1.0"
DEFAULT_BASE_URL = "https://technocore.chat"
MAX_LIMIT = 200
ROOM_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")
DID_RE = re.compile(r"^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$")


class CheckError(ValueError):
    """A receipt or URL does not satisfy the checker contract."""


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def validate_base_url(base_url: str) -> str:
    if not isinstance(base_url, str) or not base_url.strip():
        raise CheckError("base URL must be a non-empty HTTPS origin")
    normalized = base_url.strip().rstrip("/")
    parsed = urlsplit(normalized)
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        raise CheckError("base URL must be an HTTPS origin with no path, query, or fragment")
    if parsed.path not in {"", "/"}:
        raise CheckError("base URL must not contain a path")
    if parsed.username is not None or parsed.password is not None:
        raise CheckError("base URL must not contain embedded credentials")
    return normalized


def fetch(url: str, timeout: float) -> tuple[int, str, bytes]:
    request = urllib.request.Request(
        url,
        method="GET",
        headers={"Accept": "application/json, text/plain;q=0.9", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.headers.get("Content-Type", ""), response.read()
    except urllib.error.HTTPError as error:
        body = error.read(16 * 1024)
        return error.code, error.headers.get("Content-Type", "") if error.headers else "", body
    except urllib.error.URLError as error:
        raise CheckError(f"could not reach {url}: {error.reason}") from error


def load_json_object(raw: bytes, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CheckError(f"{label} was not valid JSON: {error}") from error
    if not isinstance(payload, dict):
        raise CheckError(f"{label} JSON was not an object")
    return payload


def read_room(
    base_url: str,
    room: str,
    *,
    since: int | None = None,
    limit: int = MAX_LIMIT,
    timeout: float = 20.0,
) -> dict[str, Any]:
    if ROOM_RE.fullmatch(room) is None:
        raise CheckError(f"room must match ^[a-z0-9][a-z0-9_-]{{0,47}}$: {room!r}")
    if not 1 <= limit <= MAX_LIMIT:
        raise CheckError("limit must be between 1 and 200")
    query: dict[str, str | int] = {"format": "json", "limit": limit}
    if since is not None:
        if since < 0:
            raise CheckError("since must be zero or greater")
        query["since"] = since
    url = f"{base_url}/r/{room}?{urllib.parse.urlencode(query)}"
    status, _, raw = fetch(url, timeout)
    if status != 200:
        raise CheckError(f"GET /r/{room} returned HTTP {status}")
    payload = load_json_object(raw, f"room {room}")
    if payload.get("room") != room:
        raise CheckError(f"Technocore returned data for a different room than {room}")
    return payload


def probe_note(url: str, did: str, timeout: float) -> dict[str, Any]:
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise CheckError("DID note URL must be HTTPS")
    status, _, raw = fetch(url, timeout)
    text = raw.decode("utf-8", errors="replace")
    visible = "\n".join(
        line for line in text.splitlines() if not line.startswith("!!")
    ).strip()
    return {
        "url": url,
        "http": status,
        "reachable": status == 200,
        "contains_did": did in text,
        "body_preview": visible[:500],
    }


def summarize_record(
    base_url: str,
    record: dict[str, Any],
    did: str,
    timeout: float,
) -> dict[str, Any]:
    room = record["room"]
    seq = int(record["seq"])
    nonce = str(record.get("nonce", ""))
    newest = read_room(base_url, room, limit=1, timeout=timeout)
    last_seq = int(newest["last_seq"])
    window_start = max(seq - 1, 0)
    window = read_room(
        base_url,
        room,
        since=window_start,
        limit=MAX_LIMIT,
        timeout=timeout,
    )
    first_seq = window.get("first_seq")
    messages = window.get("messages") or []
    found = next(
        (
            item
            for item in messages
            if isinstance(item, dict) and item.get("seq") == seq
        ),
        None,
    )
    did_match = bool(
        found
        and found.get("from") == did
        and (not nonce or str(found.get("nonce")) == nonce)
    )
    missed = (
        isinstance(first_seq, int)
        and first_seq > window_start + 1
        and found is None
    )
    return {
        "label": record.get("label"),
        "room": room,
        "seq": seq,
        "nonce": nonce or None,
        "posted_ts": record.get("ts"),
        "live": {
            "first_seq": first_seq,
            "last_seq": window.get("last_seq", last_seq),
            "newest_seq": last_seq,
            "count": window.get("count"),
            "window_span": (
                int(window["last_seq"]) - int(first_seq) + 1
                if isinstance(first_seq, int) and isinstance(window.get("last_seq"), int)
                else None
            ),
        },
        "in_live_window": found is not None,
        "matches_did": did_match,
        "missed_by_ring": missed,
        "sequences_ahead": last_seq - seq,
        "interpretation": (
            "still readable in the live window"
            if found is not None
            else "dropped from the live window; keep the client posted JSON and a DID note"
        ),
    }


def load_receipts(path: str) -> dict[str, Any]:
    payload = json.loads(
        __import__("pathlib").Path(path).read_text(encoding="utf-8")
    )
    if not isinstance(payload, dict):
        raise CheckError("receipts JSON must be an object")
    did = payload.get("did")
    if not isinstance(did, str) or DID_RE.fullmatch(did) is None:
        raise CheckError("receipts.did must be a 56-character Ed25519 did:key")
    records = payload.get("records")
    if not isinstance(records, list) or not records:
        raise CheckError("receipts.records must be a non-empty list")
    return payload


def run_check(receipts: dict[str, Any], timeout: float) -> dict[str, Any]:
    base_url = validate_base_url(receipts.get("base_url") or DEFAULT_BASE_URL)
    did = receipts["did"]
    note = None
    if receipts.get("did_note"):
        note = probe_note(str(receipts["did_note"]), did, timeout)
    results = [
        summarize_record(base_url, record, did, timeout)
        for record in receipts["records"]
    ]
    any_alive = any(item["in_live_window"] for item in results)
    return {
        "checked_at": utc_now(),
        "did": did,
        "base_url": base_url,
        "note": note,
        "records": results,
        "summary": {
            "records": len(results),
            "still_in_live_window": sum(1 for item in results if item["in_live_window"]),
            "dropped": sum(1 for item in results if item["missed_by_ring"]),
            "note_holds_did": bool(note and note["contains_did"]),
            "verdict": (
                "at least one receipt is still in the live room window"
                if any_alive
                else "no listed receipt is still in the live room window"
            ),
        },
        "guidance": [
            "A Technocore sequence is a server-assigned receipt, not an archive.",
            "Public room JSON does not include the signature; keep your client posted JSON.",
            "Put the durable contribution URL in a DID note. Rooms are a ring.",
        ],
    }


def text_report(result: dict[str, Any]) -> str:
    lines = [
        f"checked_at  {result['checked_at']}",
        f"did         {result['did']}",
        f"verdict     {result['summary']['verdict']}",
    ]
    note = result.get("note")
    if note:
        lines.append(
            f"did_note    HTTP {note['http']} reachable={note['reachable']} contains_did={note['contains_did']}"
        )
        lines.append(f"            {note['url']}")
    for item in result["records"]:
        live = item["live"]
        lines.append("")
        lines.append(f"[{item.get('label') or item['room']}]")
        lines.append(f"  posted     room={item['room']} seq={item['seq']} ts={item.get('posted_ts')}")
        lines.append(
            f"  live       first_seq={live['first_seq']} last_seq={live['last_seq']} span={live['window_span']}"
        )
        lines.append(
            f"  status     in_window={item['in_live_window']} missed={item['missed_by_ring']} sequences_ahead={item['sequences_ahead']}"
        )
        lines.append(f"  meaning    {item['interpretation']}")
    lines.append("")
    for tip in result["guidance"]:
        lines.append(f"- {tip}")
    return "\n".join(lines) + "\n"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python survival_check.py",
        description="Probe whether Technocore signed-write receipts are still readable.",
    )
    parser.add_argument(
        "receipts",
        nargs="?",
        default="receipts.json",
        help="JSON file of public DID receipts (default: receipts.json)",
    )
    parser.add_argument("--timeout", type=float, default=20.0)
    parser.add_argument(
        "--json",
        action="store_true",
        help="print machine-readable JSON instead of the text report",
    )
    parser.add_argument(
        "--output",
        help="also write JSON results to this path",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        receipts = load_receipts(args.receipts)
        result = run_check(receipts, args.timeout)
    except (CheckError, OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(result, handle, indent=2)
            handle.write("\n")
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(text_report(result), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
