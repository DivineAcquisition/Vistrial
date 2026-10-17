import { NextResponse } from "next/server";

import { deliveryOutcome, parseInboundPayload, sameConnection, signaturesMatch, signBody } from "@/lib/connectors/payload";
import { safeLogFields } from "@/lib/connectors/secrets";
import {
  endpointForToken,
  loadConnection,
  logDelivery,
  rememberEvent,
  webhookSecrets,
} from "@/lib/connectors/store";
import { applyInboundEvent } from "@/lib/connectors/apply";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const endpoint = await endpointForToken(token);
  if (!endpoint || endpoint.disabled) {
    return NextResponse.json({ error: "Unknown endpoint" }, { status: 401 });
  }
  const raw = await request.text();
  const secrets = await webhookSecrets(endpoint.connectionId);
  const provided = request.headers.get("x-vistrial-signature") ?? "";
  const currentOk = secrets.current ? signaturesMatch(signBody(secrets.current, raw), provided) : false;
  const previousOk =
    secrets.previous && secrets.previousUntil && Date.parse(secrets.previousUntil) > Date.now()
      ? signaturesMatch(signBody(secrets.previous, raw), provided)
      : false;
  const signatureOk = currentOk || previousOk;
  const parsed = signatureOk ? parseInboundPayload(raw) : { ok: false as const, reason: "The signature did not match." };
  const duplicate = signatureOk && parsed.ok ? !(await rememberEvent(endpoint.connectionId, parsed.event.id)) : false;
  const outcome = deliveryOutcome({
    signatureOk,
    duplicate,
    parsed: parsed.ok ? parsed : { ok: false, reason: parsed.ok ? "" : parsed.reason },
  });
  const connection = await loadConnection(endpoint.orgId, endpoint.connectionId);
  if (connection && !sameConnection(connection.id, endpoint.connectionId)) {
    return NextResponse.json({ error: "Unknown endpoint" }, { status: 401 });
  }
  if (connection && connection.status === "paused") {
    await logDelivery({
      connectionId: endpoint.connectionId,
      orgId: endpoint.orgId,
      eventType: parsed.ok ? parsed.event.type : null,
      result: "rejected",
      reason: "This connection is paused.",
      ignored: [],
    });
    return NextResponse.json({ ok: true, result: "rejected" });
  }
  await logDelivery({
    connectionId: endpoint.connectionId,
    orgId: endpoint.orgId,
    eventType: parsed.ok ? parsed.event.type : null,
    result: outcome.result,
    reason: outcome.reason,
    ignored: parsed.ok ? parsed.event.ignored : [],
  });
  if (outcome.result === "accepted" && parsed.ok && connection) {
    await applyInboundEvent({ orgId: endpoint.orgId, connection, event: parsed.event });
  }
  console.info(JSON.stringify(safeLogFields({
    event: "connector.webhook",
    orgId: endpoint.orgId,
    result: outcome.result,
  })));
  return NextResponse.json({ ok: outcome.result !== "rejected", result: outcome.result });
}
