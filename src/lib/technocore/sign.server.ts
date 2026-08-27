import { createPrivateKey, createPublicKey, sign as nodeSign, type KeyObject } from "node:crypto";
import { AGENT } from "./constants";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58btcEncode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const size = ((bytes.length - zeros) * 138) / 100 + 1;
  const b = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 256 * b[k];
      b[k] = carry % 58;
      carry = (carry / 58) | 0;
    }
    length = j;
  }
  let it = size - length;
  while (it < size && b[it] === 0) it += 1;
  let out = "1".repeat(zeros);
  for (; it < size; it++) out += B58[b[it]];
  return out;
}

function ed25519DidKey(rawPub32: Uint8Array): string {
  const prefixed = new Uint8Array(34);
  prefixed[0] = 0xed;
  prefixed[1] = 0x01;
  prefixed.set(rawPub32, 2);
  return `did:key:z${base58btcEncode(prefixed)}`;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function loadPrivateKey(): KeyObject | null {
  const raw = typeof process !== "undefined" ? process.env.TECHNOCORE_AGENT_KEY : undefined;
  if (!raw || !raw.trim()) return null;
  const material = raw.trim().replace(/\\n/g, "\n");
  const passphrase = process.env.TECHNOCORE_AGENT_KEY_PASSPHRASE || undefined;
  try {
    if (material.includes("BEGIN")) {
      return createPrivateKey(passphrase ? { key: material, passphrase } : material);
    }
    const buf = /^[0-9a-fA-F]+$/.test(material) ? Buffer.from(material, "hex") : Buffer.from(material, "base64");
    // PKCS8 Ed25519 prefix + 32-byte seed, or raw 32-byte seed wrapped.
    if (buf.length === 32 || buf.length === 64) {
      const seed = buf.subarray(0, 32);
      const der = Buffer.concat([
        Buffer.from("302e020100300506032b657004220120", "hex"),
        seed,
      ]);
      return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    }
    return createPrivateKey({ key: buf, format: "der", type: "pkcs8" });
  } catch (err) {
    console.error("[survival-agent] failed to load TECHNOCORE_AGENT_KEY", err);
    return null;
  }
}

function rawPublicKey(key: KeyObject): Uint8Array {
  const spki = createPublicKey(key).export({ type: "spki", format: "der" }) as Buffer;
  return new Uint8Array(spki.subarray(spki.length - 32));
}

export type AgentKey = {
  key: KeyObject;
  did: string;
  matchesConfiguredDid: boolean;
};

let cached: AgentKey | null | undefined;

export function getAgentKey(): AgentKey | null {
  if (cached !== undefined) return cached;
  const key = loadPrivateKey();
  if (!key) {
    cached = null;
    return null;
  }
  const did = ed25519DidKey(rawPublicKey(key));
  cached = { key, did, matchesConfiguredDid: did === AGENT.did };
  if (!cached.matchesConfiguredDid) {
    console.error(
      `[survival-agent] TECHNOCORE_AGENT_KEY DID ${did} does not match configured ${AGENT.did}; posts disabled`,
    );
  }
  return cached;
}

export function signPayload(payload: string, key: KeyObject): string {
  const sig = nodeSign(null, Buffer.from(payload, "utf8"), key);
  return b64url(sig);
}

export function sweepText(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export function nextNonce(): string {
  return String(Date.now());
}
