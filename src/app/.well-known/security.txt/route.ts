import { TRUST_FALLBACK } from "@/lib/trust/model";
import { loadTrustPublic } from "@/lib/trust/public";

export const dynamic = "force-dynamic";

export async function GET() {
  const trust = await loadTrustPublic().catch(() => TRUST_FALLBACK);
  const expires = new Date(`${trust.securityTxtExpiresOn}T00:00:00.000Z`).toISOString();
  const body = [
    `Contact: mailto:${trust.vulnerabilityEmail}`,
    "Preferred-Languages: en",
    "Canonical: https://vistrial.io/.well-known/security.txt",
    `Expires: ${expires}`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
