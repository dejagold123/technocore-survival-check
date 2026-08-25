#!/usr/bin/env python3
"""Publish REPORT.md to telegra.ph."""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPORT = (ROOT / "REPORT.md").read_text(encoding="utf-8")
INLINE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`")


def parse_inlines(text: str) -> list:
    nodes: list = []
    pos = 0
    for match in INLINE.finditer(text):
        if match.start() > pos:
            nodes.append(text[pos : match.start()])
        if match.group(1) is not None:
            nodes.append(
                {"tag": "a", "attrs": {"href": match.group(2)}, "children": [match.group(1)]}
            )
        elif match.group(3) is not None:
            nodes.append({"tag": "strong", "children": [match.group(3)]})
        else:
            nodes.append({"tag": "code", "children": [match.group(4)]})
        pos = match.end()
    if pos < len(text):
        nodes.append(text[pos:])
    return nodes or [""]


def markdown_to_nodes(md: str) -> list:
    nodes: list = []
    text = md.replace("\r\n", "\n")
    i = 0
    length = len(text)
    while i < length:
        if text.startswith("```", i):
            end = text.find("```", i + 3)
            block = text[i + 3 :] if end == -1 else text[i + 3 : end]
            i = length if end == -1 else end + 3
            block = block.lstrip("\n")
            first_nl = block.find("\n")
            if first_nl != -1:
                lang = block[:first_nl].strip()
                if lang and " " not in lang:
                    block = block[first_nl + 1 :]
            nodes.append({"tag": "pre", "children": [block.strip("\n")]})
            if i < length and text[i] == "\n":
                i += 1
            continue
        nl = text.find("\n", i)
        line = text[i:] if nl == -1 else text[i:nl]
        nxt = length if nl == -1 else nl + 1
        stripped = line.strip()
        if not stripped:
            i = nxt
            continue
        if stripped.startswith("## "):
            nodes.append({"tag": "h3", "children": parse_inlines(stripped[3:])})
            i = nxt
            continue
        if stripped.startswith("|") and "---" not in stripped:
            rows = []
            while i < length:
                cur_nl = text.find("\n", i)
                cur = text[i:] if cur_nl == -1 else text[i:cur_nl]
                if not cur.strip().startswith("|"):
                    break
                if set(cur.replace("|", "").strip()) <= set("-: "):
                    i = length if cur_nl == -1 else cur_nl + 1
                    if cur_nl == -1:
                        break
                    continue
                cells = [c.strip() for c in cur.strip().strip("|").split("|")]
                rows.append(
                    {
                        "tag": "p",
                        "children": parse_inlines(" | ".join(cells)),
                    }
                )
                i = length if cur_nl == -1 else cur_nl + 1
                if cur_nl == -1:
                    break
            nodes.extend(rows)
            continue
        nodes.append({"tag": "p", "children": parse_inlines(stripped)})
        i = nxt
    return nodes


def post_form(url: str, data: dict[str, str]) -> dict:
    encoded = urllib.parse.urlencode(data).encode()
    request = urllib.request.Request(url, data=encoded, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def main() -> int:
    lines = REPORT.splitlines()
    title = lines[0].lstrip("# ").strip()[:256]
    body = "\n".join(lines[1:]).strip()
    content = markdown_to_nodes(body)
    account = post_form(
        "https://api.telegra.ph/createAccount",
        {
            "short_name": "survival-check",
            "author_name": "Technocore survival check",
            "author_url": "https://technocore.chat",
        },
    )
    if not account.get("ok"):
        print(json.dumps(account, indent=2))
        return 1
    page = post_form(
        "https://api.telegra.ph/createPage",
        {
            "access_token": account["result"]["access_token"],
            "title": title,
            "author_name": "Technocore survival check",
            "author_url": "https://x.com/flop_labs",
            "content": json.dumps(content, ensure_ascii=False),
        },
    )
    print(json.dumps(page, indent=2))
    if page.get("ok"):
        print("URL=" + page["result"]["url"])
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
