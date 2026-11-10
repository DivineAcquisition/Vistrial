"use node";
/**
 * One HTTP request, made so it cannot be steered at a private address. The address check runs inside the
 * connection's own DNS lookup, so the address that was checked is the address that is connected to (a name
 * that answers "public" once and "private" the next time gains nothing). Redirects are not followed here:
 * the caller checks each one as a new link. The body is cut at a byte limit, counted after decompression.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";

import { USER_AGENT, isIpLiteral, isPublicAddress } from "./net";
import { FetchFailure, type RawResponse } from "./read";

export type NodeFetchOptions = {
  timeoutMs: number;
  maxBytes: number;
  accept?: string;
  /** Tests only: the address rule and the resolver. Production always uses the defaults. */
  allowAddress?: (address: string) => boolean;
  resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
};

function systemResolve(hostname: string) {
  return new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => (error ? reject(error) : resolve(addresses)));
  });
}

/** A DNS lookup for net.connect that refuses a name if any address it resolves to is not public. */
function guardedLookup(allow: (address: string) => boolean, resolve: NonNullable<NodeFetchOptions["resolve"]>): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (found) => {
        if (found.length === 0) return callback(Object.assign(new Error("no address"), { code: "ENOTFOUND" }), "", 4);
        if (!found.every((row) => allow(row.address))) return callback(Object.assign(new Error("private address"), { code: "EPRIVATE" }), "", 4);
        if (typeof options === "object" && options.all) return callback(null, found);
        return callback(null, found[0].address, found[0].family);
      },
      (error: NodeJS.ErrnoException) => callback(Object.assign(new Error("lookup failed"), { code: error?.code ?? "ENOTFOUND" }), "", 4),
    );
  };
}

function failureCode(error: NodeJS.ErrnoException): string {
  const code = error.code ?? "";
  if (code === "EPRIVATE") return "private_address";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") return "dns_failed";
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return "timeout";
  if (code.startsWith("ERR_TLS") || code.startsWith("CERT_") || code.includes("CERT") || code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "ERR_SSL_WRONG_VERSION_NUMBER") return "tls_failed";
  return "connect_failed";
}

export function nodeFetch(url: URL, options: NodeFetchOptions): Promise<RawResponse> {
  const allow = options.allowAddress ?? isPublicAddress;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(host) && !allow(host)) return Promise.reject(new FetchFailure("private_address"));

  return new Promise<RawResponse>((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run();
    };
    const fail = (code: string) => finish(() => reject(new FetchFailure(code)));

    const request = (url.protocol === "https:" ? https : http).request(url, {
      method: "GET",
      // A new connection every time: no pooled socket can carry a request past the lookup check.
      agent: false,
      lookup: guardedLookup(allow, options.resolve ?? systemResolve),
      headers: {
        "user-agent": USER_AGENT,
        accept: options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "accept-language": "en",
        "accept-encoding": "gzip, deflate, br",
      },
    });
    const timer = setTimeout(() => {
      request.destroy();
      fail("timeout");
    }, options.timeoutMs);

    request.on("socket", (socket) => {
      socket.on("connect", () => {
        // Belt and braces: whatever resolved, the peer we are actually talking to must be public.
        if (socket.remoteAddress && !allow(socket.remoteAddress)) {
          request.destroy();
          fail("private_address");
        }
      });
    });
    request.on("error", (error: NodeJS.ErrnoException) => fail(failureCode(error)));
    request.on("response", (response) => {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(response.headers)) {
        if (typeof value === "string") headers[name] = value;
        else if (Array.isArray(value)) headers[name] = value.join(", ");
      }
      const encoding = (headers["content-encoding"] ?? "").toLowerCase();
      const decoder = encoding.includes("br") ? zlib.createBrotliDecompress() : encoding.includes("gzip") ? zlib.createGunzip() : encoding.includes("deflate") ? zlib.createInflate() : null;
      const chunks: Buffer[] = [];
      let size = 0;
      let wireBytes = 0;
      let truncated = false;
      const done = () =>
        finish(() => resolve({ status: response.statusCode ?? 0, headers, body: new Uint8Array(Buffer.concat(chunks)), truncated, wireBytes, address: response.socket?.remoteAddress ?? "" }));
      const take = (chunk: Buffer) => {
        if (truncated) return;
        const room = options.maxBytes - size;
        if (chunk.length >= room) {
          chunks.push(chunk.subarray(0, room));
          size += room;
          truncated = true;
          // Enough has been read. Stop the transfer; what arrived is kept.
          response.destroy();
          decoder?.destroy();
          done();
          return;
        }
        chunks.push(chunk);
        size += chunk.length;
      };
      response.on("data", (chunk: Buffer) => {
        wireBytes += chunk.length;
      });
      response.on("error", () => (chunks.length ? done() : fail("connect_failed")));
      if (decoder) {
        decoder.on("data", take);
        decoder.on("end", done);
        // A broken or cut-off compressed body: keep what decoded.
        decoder.on("error", () => (chunks.length ? ((truncated = true), done()) : fail("bad_encoding")));
        response.pipe(decoder);
      } else {
        response.on("data", take);
        response.on("end", done);
      }
    });
    request.end();
  });
}
