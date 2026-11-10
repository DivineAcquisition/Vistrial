/**
 * The real request path, against a server on this machine. The address rule is relaxed for the mechanics
 * (status, headers, size limit, timeout, no redirect following) and left at its default to prove that the
 * default refuses this very server.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { USER_AGENT, isPublicAddress } from "./net";
import { nodeFetch } from "./nodeFetch";
import { FetchFailure } from "./read";

let server: http.Server;
let port = 0;
const seen: { url: string; agent: string; cookie: string | undefined }[] = [];
const local = { allowAddress: () => true, timeoutMs: 2_000, maxBytes: 10_000 };
const at = (path: string) => new URL(`http://127.0.0.1:${port}${path}`);

beforeAll(async () => {
  server = http.createServer((request, response) => {
    seen.push({ url: request.url ?? "", agent: request.headers["user-agent"] ?? "", cookie: request.headers.cookie });
    if (request.url === "/page") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "set-cookie": "session=abc" });
      response.end("<h1>Hello</h1>");
    } else if (request.url === "/gzip") {
      response.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      response.end(zlib.gzipSync("<p>" + "squeezed ".repeat(50) + "</p>"));
    } else if (request.url === "/bomb") {
      // 5 MB of zeros squeezes to a few kilobytes on the wire.
      response.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      response.end(zlib.gzipSync(Buffer.alloc(5_000_000, "a")));
    } else if (request.url === "/big") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("x".repeat(50_000));
    } else if (request.url === "/redirect") {
      response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      response.end();
    } else if (request.url === "/slow") {
      // Never answers.
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const code = (run: Promise<unknown>) => run.then(() => "no failure", (error) => (error instanceof FetchFailure ? error.code : `unexpected: ${String(error)}`));

describe("one guarded request", () => {
  it("returns the status, headers and body, says who it is, and carries no cookies", async () => {
    const response = await nodeFetch(at("/page"), local);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(new TextDecoder().decode(response.body)).toBe("<h1>Hello</h1>");
    expect(response.truncated).toBe(false);
    await nodeFetch(at("/page"), local);
    const requests = seen.filter((row) => row.url === "/page");
    expect(requests.every((row) => row.agent === USER_AGENT)).toBe(true);
    // The first response set a cookie. The second request did not send it back: nothing is kept between requests.
    expect(requests.map((row) => row.cookie)).toEqual([undefined, undefined]);
  });

  it("decompresses, and counts the limit after decompression", async () => {
    const squeezed = await nodeFetch(at("/gzip"), local);
    expect(new TextDecoder().decode(squeezed.body)).toContain("squeezed squeezed");
    expect(squeezed.wireBytes).toBeLessThan(squeezed.body.byteLength);

    const bomb = await nodeFetch(at("/bomb"), local);
    expect(bomb.truncated).toBe(true);
    expect(bomb.body.byteLength).toBe(10_000);
  });

  it("stops at the byte limit and at the time limit", async () => {
    const big = await nodeFetch(at("/big"), local);
    expect(big.truncated).toBe(true);
    expect(big.body.byteLength).toBe(10_000);
    expect(await code(nodeFetch(at("/slow"), { ...local, timeoutMs: 150 }))).toBe("timeout");
  });

  it("hands a redirect back instead of following it", async () => {
    const response = await nodeFetch(at("/redirect"), local);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://169.254.169.254/latest/meta-data/");
    expect(seen.filter((row) => row.url.includes("meta-data"))).toEqual([]);
  });

  it("by default refuses this machine, by address and by any name that resolves to it", async () => {
    const options = { timeoutMs: 2_000, maxBytes: 10_000 };
    expect(await code(nodeFetch(at("/page"), options))).toBe("private_address");
    expect(await code(nodeFetch(new URL(`http://[::1]:${port}/page`), options))).toBe("private_address");
    const before = seen.length;
    // A public-looking name whose DNS answer is private (the rebinding case): refused at connect, nothing sent.
    const rebind = { ...options, resolve: async () => [{ address: "127.0.0.1", family: 4 }] };
    expect(await code(nodeFetch(new URL(`http://public-looking.example.com:${port}/page`), rebind))).toBe("private_address");
    // One public and one private answer: still refused, so a resolver cannot be raced.
    const mixed = { ...options, resolve: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }] };
    expect(await code(nodeFetch(new URL(`http://mixed.example.com:${port}/page`), mixed))).toBe("private_address");
    const metadata = { ...options, resolve: async () => [{ address: "169.254.169.254", family: 4 }] };
    expect(await code(nodeFetch(new URL("http://metadata.example.com/latest/"), metadata))).toBe("private_address");
    expect(seen.length).toBe(before);
  });

  it("connects to the address that was checked", async () => {
    // The name resolves, through our resolver, to this server; the allow rule sees exactly that address.
    const checked: string[] = [];
    const response = await nodeFetch(new URL(`http://some-name.example.com:${port}/page`), {
      ...local,
      allowAddress: (address) => (checked.push(address), true),
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    expect(response.status).toBe(200);
    expect(checked).toContain("127.0.0.1");
    expect(isPublicAddress("127.0.0.1")).toBe(false);
  });

  it("reports a name that does not exist", async () => {
    const missing = { timeoutMs: 2_000, maxBytes: 10_000, resolve: async () => Promise.reject(Object.assign(new Error("nope"), { code: "ENOTFOUND" })) };
    expect(await code(nodeFetch(new URL("http://no-such-host.example.com/"), missing))).toBe("dns_failed");
  });
});
