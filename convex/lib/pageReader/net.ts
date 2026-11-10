/**
 * Which addresses the page reader may open. Vistrial fetches pages a customer names, from our servers, so a
 * link must never reach anything a member of the public could not: not this machine, not the private
 * network around it, not a cloud metadata service. The rule is applied to the link as typed, to every
 * address its name resolves to at the moment of connecting, and again to every redirect.
 */

/** How the reader names itself to every site. It never pretends to be a person's browser. */
export const USER_AGENT = "VistrialBot/1.0 (+https://vistrial.io/bot)";
/** The name robots.txt rules are matched against. */
export const ROBOTS_AGENT = "vistrialbot";

export type TargetRefusal = "bad_url" | "bad_scheme" | "has_credentials" | "bad_port" | "private_address";

const PORTS: Record<string, string> = { "http:": "80", "https:": "443" };

function ipv4Parts(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    out.push(value);
  }
  return out;
}

function publicIpv4(parts: number[]): boolean {
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return false; // "this network", private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, where cloud metadata lives
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // protocol assignments, documentation
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** An IPv6 address as eight 16-bit groups, or null when it is not one. Accepts "::" and a dotted IPv4 tail. */
export function ipv6Groups(raw: string): number[] | null {
  let text = raw.toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  if (!/^[0-9a-f:.]+$/.test(text) || !text.includes(":")) return null;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = ipv4Parts(tail);
    if (!v4) return null;
    text = `${text.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":").map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : Number.NaN)));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if ([...head, ...rest].some(Number.isNaN)) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const gap = 8 - head.length - rest.length;
  if (gap < 1) return null;
  return [...head, ...new Array<number>(gap).fill(0), ...rest];
}

function publicIpv6(groups: number[]): boolean {
  const [a, b, c, d, e, f, g, h] = groups;
  const embedded = () => publicIpv4([g >> 8, g & 255, h >> 8, h & 255]);
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0) {
    // "::", "::1", IPv4-mapped (::ffff:a.b.c.d) and the old IPv4-compatible form: judged by the IPv4 inside.
    if (f === 0xffff) return embedded();
    return false;
  }
  if (a === 0x64 && b === 0xff9b) return c === 0 && d === 0 && e === 0 && f === 0 ? embedded() : false; // NAT64
  if (a === 0x2002) return publicIpv4([b >> 8, b & 255, c >> 8, c & 255]); // 6to4 carries an IPv4
  if (a === 0x2001 && b === 0) return false; // Teredo
  if (a === 0x2001 && b === 0xdb8) return false; // documentation
  if ((a & 0xfe00) === 0xfc00) return false; // unique local
  if ((a & 0xffc0) === 0xfe80) return false; // link-local
  if ((a & 0xffc0) === 0xfec0) return false; // site-local (deprecated)
  if ((a & 0xff00) === 0xff00) return false; // multicast
  // Global unicast is 2000::/3. Everything else is unassigned or special.
  return (a & 0xe000) === 0x2000;
}

/** True only for an address on the public internet. Anything that is not clearly an IP address is false. */
export function isPublicAddress(address: string): boolean {
  const v4 = ipv4Parts(address);
  if (v4) return publicIpv4(v4);
  const v6 = ipv6Groups(address.replace(/^\[|\]$/g, ""));
  return v6 ? publicIpv6(v6) : false;
}

/** True when the text is an IP address of either family (with or without brackets). */
export function isIpLiteral(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  return ipv4Parts(bare) !== null || ipv6Groups(bare) !== null;
}

const PRIVATE_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".home.arpa", ".test", ".invalid", ".example", ".onion"];

/**
 * A link the reader may try, or why not. Only http and https, only the standard port, no user name or
 * password in the link, and no name or address that is plainly private. A public-looking name is still
 * checked again when it is resolved: see `isPublicAddress`.
 */
export function parseTarget(raw: string): { ok: true; url: URL } | { ok: false; reason: TargetRefusal } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "bad_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "bad_scheme" };
  if (url.username || url.password) return { ok: false, reason: "has_credentials" };
  if (url.port && url.port !== PORTS[url.protocol]) return { ok: false, reason: "bad_port" };
  // The URL parser has already turned forms like 0x7f.1, 2130706433 and 017700000001 into dotted IPv4.
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "bad_url" };
  if (isIpLiteral(host)) return isPublicAddress(host) ? { ok: true, url } : { ok: false, reason: "private_address" };
  if (host === "localhost" || !host.includes(".") || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return { ok: false, reason: "private_address" };
  url.hash = "";
  return { ok: true, url };
}

/** The key a site is rate limited and robots-checked under: scheme and host, lower case. */
export function siteKey(url: URL) {
  return `${url.protocol}//${url.host.toLowerCase()}`;
}
