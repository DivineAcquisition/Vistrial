import "server-only";

/**
 * @deprecated Use staffBaseUrl / clientBaseUrl / webhookBaseUrl from
 * `@/lib/settings/urls`. Links must never be inferred from the request host.
 *
 * Kept as a thin alias to the staff base URL only where a caller has not yet
 * been classified — prefer the explicit helpers.
 */
export { staffBaseUrl as baseUrl } from "@/lib/settings/urls";

export {
  clientBaseUrl,
  staffBaseUrl,
  webhookBaseUrl,
} from "@/lib/settings/urls";
