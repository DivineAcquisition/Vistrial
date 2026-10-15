import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";

/**
 * The one check before Vistrial calls an address a customer supplied.
 * Webhook delivery and Slack or Teams notifications both use it.
 */

export class OutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundUrlError";
  }
}

const BLOCKED_NAMES = new Set(["localhost", "metadata.google.internal", "metadata.internal"]);

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("ff")) return true;
  const v4 = ip.includes(":") ? null : ip.split(".").map((part) => Number(part));
  if (!v4 || v4.length !== 4 || v4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return ip.includes(":");
  }
  const [a, b] = v4;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && v4[2] === 2) return true;
  if (a === 198 && b === 51 && v4[2] === 100) return true;
  if (a === 203 && b === 0 && v4[2] === 113) return true;
  if (a >= 224) return true;
  return false;
}

function hostBlocked(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_NAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    return true;
  }
  if (isIP(host)) return isPrivateAddress(host);
  return false;
}

export async function assertPublicHttps(raw: string): Promise<{ url: URL; address: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundUrlError("That address is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new OutboundUrlError("The address has to use https.");
  if (url.username || url.password) throw new OutboundUrlError("The address cannot include a username or password.");
  if (url.port && url.port !== "443") throw new OutboundUrlError("The address has to use the standard https port.");
  if (hostBlocked(url.hostname)) throw new OutboundUrlError("That address is not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new OutboundUrlError("That address could not be looked up.");
  }
  if (records.length === 0) throw new OutboundUrlError("That address could not be looked up.");
  for (const record of records) {
    if (isPrivateAddress(record.address)) throw new OutboundUrlError("That address points at a private network.");
  }
  return { url, address: records[0]!.address };
}

const STRIPPED_HEADERS = new Set(["authorization", "cookie", "host", "proxy-authorization"]);

export async function postOutbound(args: {
  url: string;
  body: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<{ status: number; body: string }> {
  const first = await assertPublicHttps(args.url);
  const second = await assertPublicHttps(args.url);
  if (second.address !== first.address) {
    throw new OutboundUrlError("The address changed before the connection opened.");
  }
  const headers: Record<string, string> = {
    Host: first.url.hostname,
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(args.body)),
  };
  for (const [key, value] of Object.entries(args.headers ?? {})) {
    if (!STRIPPED_HEADERS.has(key.toLowerCase())) headers[key] = value;
  }
  const maxBytes = args.maxBytes ?? 64_000;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: second.address,
        servername: first.url.hostname,
        method: "POST",
        path: `${first.url.pathname}${first.url.search}`,
        headers,
        timeout: args.timeoutMs ?? 5_000,
        rejectUnauthorized: true,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          reject(new OutboundUrlError("Redirects are not followed."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            reject(new OutboundUrlError("The response was too large."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8").slice(0, 500) });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new OutboundUrlError("The address did not answer in time."));
    });
    req.on("error", () => reject(new OutboundUrlError("The address could not be reached.")));
    req.end(args.body);
  });
}
