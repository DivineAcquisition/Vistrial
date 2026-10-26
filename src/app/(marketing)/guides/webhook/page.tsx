import type { Metadata } from "next";

export const metadata: Metadata = { title: "Webhook payload" };

export default function WebhookGuidePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm text-foreground">
      <h1 className="text-2xl">Send data to Vistrial</h1>
      <p className="mt-4 text-muted-foreground">
        Use this when a tool can send a webhook but does not have its own connector. Each connection has its own address and its own signing secret. A secret from one workspace does nothing in another.
      </p>
      <h2 className="mt-8 text-lg">Request</h2>
      <p className="mt-2 text-muted-foreground">POST the JSON body. Sign the raw body with HMAC SHA-256 and send the hex digest in the header x-vistrial-signature. Keep the body under 256 KB.</p>
      <pre className="mt-4 overflow-x-auto rounded-md bg-muted p-4">{`{
  "version": 1,
  "id": "evt_123",
  "type": "person.updated",
  "occurred_at": "2026-10-17T15:00:00.000Z",
  "historic": true,
  "person": {
    "external_id": "crm_1",
    "email": "ada@example.com",
    "phone": "+15555550100",
    "first_name": "Ada",
    "last_name": "Lovelace"
  },
  "fields": { "stage": "New" }
}`}</pre>
      <p className="mt-4 text-muted-foreground">
        Message text, transcripts, and notes are dropped. Unknown fields are ignored and listed by name in the delivery log. Set historic to true for past records so they do not start alerts, tasks, or drafts. Send opt_out true, or type person.opt_out, to stop outreach. Another event cannot clear that.
      </p>
      <h2 className="mt-8 text-lg">Common senders</h2>
      <p className="mt-2 text-muted-foreground">
        In an automation tool, add a webhook step, paste the address from Connections, and map your fields onto the names above. Use the event id your tool already has so retries are not applied twice.
      </p>
    </main>
  );
}
