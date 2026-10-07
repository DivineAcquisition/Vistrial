import { holdUnpluggedSource } from "@/lib/inbound/unplugged";

export const dynamic = "force-dynamic";

/** Telnyx is not plugged in. Events are held for review and nothing acts on them. */
export async function POST(request: Request) {
  return holdUnpluggedSource(request, "telnyx", "/api/webhooks/telnyx");
}
