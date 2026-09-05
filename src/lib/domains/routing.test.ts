import { describe, expect, it } from "vitest";

import {
  PRODUCTION_APP_ORIGIN,
  PRODUCTION_FORSIGHT_ORIGIN,
  PRODUCTION_SITE_ORIGIN,
  PRODUCTION_STELLAR_ORIGIN,
} from "@/lib/constants";
import { signedInPath, defaultInternalPath } from "@/lib/domains/landing";
import { resolveHostRoute, resolvedHostLocation } from "@/lib/domains/routing";
import {
  classifyProductHost,
  isForsightHost,
  isOperatorAppHost,
  isSiteHost,
  isStellarHost,
} from "@/lib/marketing/hosts";
import { FORSIGHT_PATH } from "@/lib/navigation";

describe("product hosts do not overlap", () => {
  it("gives each production hostname exactly one product", () => {
    expect(classifyProductHost("vistrial.io")).toBe("site");
    expect(classifyProductHost("www.vistrial.io")).toBe("site");
    expect(classifyProductHost("WWW.VISTRIAL.IO")).toBe("site");
    expect(classifyProductHost("app.vistrial.io")).toBe("app");
    expect(classifyProductHost("app.vistrial.io:443")).toBe("app");
    expect(classifyProductHost("pulse.vistrial.io")).toBe("pulse");
    expect(classifyProductHost("forsight.vistrial.io")).toBe("stellar");
    expect(classifyProductHost("localhost:3000")).toBe("local");
    expect(classifyProductHost("vistrial-git-preview.vercel.app")).toBe("local");
    expect(classifyProductHost("admin.vistrial.io")).toBe("unknown");
  });

  it("rejects suffix lookalikes", () => {
    expect(isOperatorAppHost("app.vistrial.io.evil.example")).toBe(false);
    expect(isForsightHost("pulse.vistrial.io.evil.example")).toBe(false);
    expect(isStellarHost("forsight.vistrial.io.evil.example")).toBe(false);
    expect(isSiteHost("vistrial.io.evil.example")).toBe(false);
    expect(classifyProductHost("pulse.vistrial.io.evil.example")).toBe("unknown");
  });

  it("keeps Stellar and core Forsight on different hosts", () => {
    expect(new URL(PRODUCTION_STELLAR_ORIGIN).hostname).not.toBe(
      new URL(PRODUCTION_FORSIGHT_ORIGIN).hostname
    );
    expect(isStellarHost("pulse.vistrial.io")).toBe(false);
    expect(isForsightHost("forsight.vistrial.io")).toBe(false);
    expect(isOperatorAppHost("forsight.vistrial.io")).toBe(false);
  });
});

describe("strict host routing", () => {
  it("keeps the marketing site off the operator products", () => {
    expect(resolvedHostLocation({ host: "app.vistrial.io", pathname: "/privacy" })).toBe(
      `${PRODUCTION_SITE_ORIGIN}/privacy`
    );
    expect(resolvedHostLocation({ host: "pulse.vistrial.io", pathname: "/terms" })).toBe(
      `${PRODUCTION_SITE_ORIGIN}/terms`
    );
    expect(resolvedHostLocation({ host: "forsight.vistrial.io", pathname: "/contact" })).toBe(
      `${PRODUCTION_SITE_ORIGIN}/contact`
    );
    expect(resolveHostRoute({ host: "www.vistrial.io", pathname: "/" })).toEqual({
      action: "allow",
    });
    expect(resolveHostRoute({ host: "vistrial.io", pathname: "/book/calendar" })).toEqual({
      action: "allow",
    });
  });

  it("sends operator paths on the site to the operator app", () => {
    expect(resolvedHostLocation({ host: "vistrial.io", pathname: "/app/queue" })).toBe(
      `${PRODUCTION_APP_ORIGIN}/app/queue`
    );
    expect(
      resolvedHostLocation({
        host: "www.vistrial.io",
        pathname: "/app/queue",
        search: "?filter=ready",
      })
    ).toBe(`${PRODUCTION_APP_ORIGIN}/app/queue?filter=ready`);
    expect(resolvedHostLocation({ host: "vistrial.io", pathname: "/login" })).toBe(
      `${PRODUCTION_APP_ORIGIN}/login`
    );
    expect(resolvedHostLocation({ host: "vistrial.io", pathname: "/portal" })).toBe(
      `${PRODUCTION_APP_ORIGIN}/portal`
    );
  });

  it("sends Forsight bookmark paths on the site to pulse", () => {
    expect(resolvedHostLocation({ host: "vistrial.io", pathname: FORSIGHT_PATH })).toBe(
      `${PRODUCTION_FORSIGHT_ORIGIN}${FORSIGHT_PATH}`
    );
    expect(
      resolvedHostLocation({ host: "www.vistrial.io", pathname: `${FORSIGHT_PATH}/pipeline` })
    ).toBe(`${PRODUCTION_FORSIGHT_ORIGIN}${FORSIGHT_PATH}/pipeline`);
  });

  it("sends Stellar paths on every other host to forsight.vistrial.io", () => {
    expect(resolvedHostLocation({ host: "app.vistrial.io", pathname: "/stellar" })).toBe(
      `${PRODUCTION_STELLAR_ORIGIN}/stellar`
    );
    expect(resolvedHostLocation({ host: "pulse.vistrial.io", pathname: "/stellar/log" })).toBe(
      `${PRODUCTION_STELLAR_ORIGIN}/stellar/log`
    );
    expect(resolvedHostLocation({ host: "vistrial.io", pathname: "/stellar/portal" })).toBe(
      `${PRODUCTION_STELLAR_ORIGIN}/stellar/portal`
    );
  });

  it("does not serve the operator app on the Stellar host", () => {
    expect(resolvedHostLocation({ host: "forsight.vistrial.io", pathname: "/app/queue" })).toBe(
      `${PRODUCTION_APP_ORIGIN}/app/queue`
    );
    expect(resolvedHostLocation({ host: "forsight.vistrial.io", pathname: "/portal" })).toBe(
      `${PRODUCTION_APP_ORIGIN}/portal`
    );
    expect(resolveHostRoute({ host: "forsight.vistrial.io", pathname: "/stellar/log" })).toEqual({
      action: "allow",
    });
    expect(resolveHostRoute({ host: "forsight.vistrial.io", pathname: "/login" })).toEqual({
      action: "allow",
    });
  });

  it("uses each product's own front door on /", () => {
    expect(resolvedHostLocation({ host: "app.vistrial.io", pathname: "/" })).toBe(
      `${PRODUCTION_APP_ORIGIN}/login`
    );
    expect(resolvedHostLocation({ host: "pulse.vistrial.io", pathname: "/" })).toBe(
      `${PRODUCTION_FORSIGHT_ORIGIN}${FORSIGHT_PATH}`
    );
    expect(resolvedHostLocation({ host: "forsight.vistrial.io", pathname: "/" })).toBe(
      `${PRODUCTION_STELLAR_ORIGIN}/stellar`
    );
    expect(resolveHostRoute({ host: "vistrial.io", pathname: "/" })).toEqual({ action: "allow" });
  });

  it("lets pulse serve the rest of the operator app", () => {
    expect(resolveHostRoute({ host: "pulse.vistrial.io", pathname: "/app/queue" })).toEqual({
      action: "allow",
    });
    expect(resolveHostRoute({ host: "pulse.vistrial.io", pathname: FORSIGHT_PATH })).toEqual({
      action: "allow",
    });
    expect(resolveHostRoute({ host: "app.vistrial.io", pathname: FORSIGHT_PATH })).toEqual({
      action: "allow",
    });
  });

  it("does not isolate products on localhost or preview deploys", () => {
    expect(resolveHostRoute({ host: "localhost:3000", pathname: "/stellar" })).toEqual({
      action: "allow",
    });
    expect(resolveHostRoute({ host: "localhost:3000", pathname: "/privacy" })).toEqual({
      action: "allow",
    });
    expect(resolveHostRoute({ host: "localhost:3000", pathname: "/app/queue" })).toEqual({
      action: "allow",
    });
    expect(
      resolveHostRoute({ host: "vistrial-git-preview.vercel.app", pathname: "/stellar/console" })
    ).toEqual({ action: "allow" });
  });

  it("does not serve /app on an unknown host", () => {
    expect(resolvedHostLocation({ host: "evil.example", pathname: "/app/queue" })).toBe(
      `${PRODUCTION_APP_ORIGIN}/app/queue`
    );
    expect(resolvedHostLocation({ host: "admin.vistrial.io", pathname: "/stellar" })).toBe(
      `${PRODUCTION_STELLAR_ORIGIN}/stellar`
    );
  });

  it("keeps marketing analytics on the site and operator APIs on the app", () => {
    expect(resolveHostRoute({ host: "vistrial.io", pathname: "/api/marketing/events" })).toEqual({
      action: "allow",
    });
    expect(resolvedHostLocation({ host: "vistrial.io", pathname: "/api/cron/ghost-detector" })).toBe(
      `${PRODUCTION_APP_ORIGIN}/api/cron/ghost-detector`
    );
    expect(resolvedHostLocation({ host: "forsight.vistrial.io", pathname: "/api/ghl/webhooks" })).toBe(
      `${PRODUCTION_APP_ORIGIN}/api/ghl/webhooks`
    );
    expect(resolveHostRoute({ host: "forsight.vistrial.io", pathname: "/api/health" })).toEqual({
      action: "allow",
    });
  });

  it("does not treat /stellarfoo as Stellar or /booking as marketing", () => {
    expect(resolvedHostLocation({ host: "app.vistrial.io", pathname: "/stellarfoo" })).toBe(
      `${PRODUCTION_SITE_ORIGIN}/`
    );
    expect(resolveHostRoute({ host: "vistrial.io", pathname: "/booking" })).toEqual({
      action: "redirect",
      origin: "site",
      pathname: "/",
      preserveSearch: true,
    });
  });
});

describe("signed-in landing follows the host", () => {
  it("keeps a Stellar host inside Stellar", () => {
    expect(defaultInternalPath("stellar")).toBe("/stellar");
    expect(signedInPath({ product: "stellar", next: "/app/queue" })).toBe("/stellar");
    expect(signedInPath({ product: "stellar", next: "/stellar/log" })).toBe("/stellar/log");
    expect(signedInPath({ product: "stellar", next: "/portal", surfaceAccess: "portal" })).toBe(
      "/stellar"
    );
  });

  it("keeps a requested core path on pulse and defaults the rest to Forsight", () => {
    expect(defaultInternalPath("pulse")).toBe(FORSIGHT_PATH);
    expect(signedInPath({ product: "pulse", next: "/app/queue" })).toBe("/app/queue");
    expect(signedInPath({ product: "pulse", next: FORSIGHT_PATH })).toBe(FORSIGHT_PATH);
  });

  it("does not send a portal-only member into the operator app", () => {
    expect(signedInPath({ product: "app", next: "/app/queue", surfaceAccess: "portal" })).toBe(
      "/portal"
    );
  });

  it("sends a DA operator with no membership to Stellar from any host", () => {
    expect(
      signedInPath({ product: "app", next: "/app/queue", stellarDaOperator: true })
    ).toBe("/stellar");
    expect(
      signedInPath({ product: "stellar", next: "/stellar/console", stellarDaOperator: true })
    ).toBe("/stellar/console");
  });
});
