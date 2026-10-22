import "server-only";

import { readAccessToken, readApiKey, readConnectionSetup } from "@/lib/connectors/store";
import type { Connector } from "@/lib/spine/contract";
import { airtableConnector } from "@/lib/spine/connectors/airtable";
import { fathomConnector } from "@/lib/spine/connectors/fathom";
import { firefliesConnector } from "@/lib/spine/connectors/fireflies";
import { hubspotConnector } from "@/lib/spine/connectors/hubspot";

/** The native connectors, in the order Owners connect them. */
export const NATIVE_CONNECTOR_KEYS = ["hubspot", "fathom", "fireflies", "airtable"] as const;

export function nativeConnector(key: string): Connector | null {
  const oauth = { fetch, credential: readAccessToken, setup: readConnectionSetup };
  const apiKey = { fetch, credential: async (connectionId: string) => (await readApiKey(connectionId)).secret, setup: readConnectionSetup };
  switch (key) {
    case "hubspot":
      return hubspotConnector({ ...oauth, clientId: process.env.HUBSPOT_CLIENT_ID });
    case "airtable":
      return airtableConnector({ ...oauth, clientId: process.env.AIRTABLE_CLIENT_ID });
    case "fathom":
      return fathomConnector(apiKey);
    case "fireflies":
      return firefliesConnector(apiKey);
    default:
      return null;
  }
}
