/**
 * The payment processor.
 *
 * Vistrial stores the processor's customer and payment method references and
 * the card metadata the processor reports back. It never stores, transmits, or
 * displays a card number: capture happens entirely inside Stripe's own hosted
 * flow, and the browser never touches this module.
 *
 * Every call is explicit about what happens when Stripe is not configured. A
 * silent no-op here would look exactly like a payment that succeeded.
 */

const API = "https://api.stripe.com/v1";

export type CardDetails = {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

export type StripeFailure = {
  ok: false;
  /** The processor's own code where it gave one. */
  code: string;
  message: string;
  /** Whether another attempt could plausibly succeed. */
  retryable: boolean;
};

export type PaymentSuccess = { ok: true; reference: string };
export type PaymentResult = PaymentSuccess | StripeFailure;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

const NOT_CONFIGURED: StripeFailure = {
  ok: false,
  code: "processor_not_configured",
  message:
    "No payment processor is configured. Set STRIPE_SECRET_KEY before a client can be charged.",
  retryable: true,
};

/** Stripe takes form-encoded bodies, including for nested and array fields. */
function encode(params: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix === "" ? key : `${prefix}[${key}]`;

    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        parts.push(`${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(entry))}`);
      });
      continue;
    }

    if (typeof value === "object") {
      parts.push(...encode(value as Record<string, unknown>, name));
      continue;
    }

    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }

  return parts;
}

type StripeError = {
  error?: { code?: string; decline_code?: string; message?: string; type?: string };
};

/** Failures a later attempt cannot fix, so the retry schedule does not waste itself. */
const PERMANENT_CODES = new Set([
  "card_declined",
  "expired_card",
  "incorrect_number",
  "invalid_expiry_month",
  "invalid_expiry_year",
  "invalid_cvc",
  "payment_method_not_available",
]);

async function request<T>(
  path: string,
  params: Record<string, unknown>,
  options: { method?: string; idempotencyKey?: string } = {}
): Promise<{ ok: true; data: T } | StripeFailure> {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return NOT_CONFIGURED;

  const method = options.method ?? "POST";
  const body = encode(params).join("&");

  const headers: Record<string, string> = {
    authorization: `Bearer ${secret}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  // The same key on a retried request returns the original result rather than
  // taking the money a second time.
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(
      method === "GET" && body !== "" ? `${API}${path}?${body}` : `${API}${path}`,
      {
        method,
        headers,
        body: method === "GET" ? undefined : body,
      }
    );
  } catch (thrown) {
    return {
      ok: false,
      code: "processor_unreachable",
      message: `Could not reach Stripe: ${
        thrown instanceof Error ? thrown.message : String(thrown)
      }`,
      retryable: true,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as T & StripeError;

  if (!response.ok) {
    const code = payload.error?.decline_code ?? payload.error?.code ?? "processor_error";
    return {
      ok: false,
      code,
      message: payload.error?.message ?? `Stripe returned ${response.status}.`,
      retryable: !PERMANENT_CODES.has(code) && response.status >= 500,
    };
  }

  return { ok: true, data: payload as T };
}

/* -------------------------------------------------------------------------- */
/* Payment method capture                                                      */
/* -------------------------------------------------------------------------- */

type Customer = { id: string };

export async function ensureCustomer(input: {
  clientId: string;
  name: string;
  email: string | null;
  existingCustomerId: string | null;
}): Promise<{ ok: true; customerId: string } | StripeFailure> {
  if (input.existingCustomerId) {
    return { ok: true, customerId: input.existingCustomerId };
  }

  const created = await request<Customer>("/customers", {
    name: input.name,
    email: input.email ?? undefined,
    metadata: { vistrial_client_id: input.clientId },
  });

  return created.ok ? { ok: true, customerId: created.data.id } : created;
}

type CheckoutSession = { id: string; url: string | null; setup_intent: string | null };

/**
 * A hosted setup session. The client follows the link, enters their card on
 * Stripe's own page, and nothing sensitive ever passes through Vistrial.
 */
export async function createSetupSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<{ ok: true; sessionId: string; url: string } | StripeFailure> {
  const created = await request<CheckoutSession>("/checkout/sessions", {
    mode: "setup",
    customer: input.customerId,
    currency: "usd",
    success_url: `${input.returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.returnUrl}?cancelled=1`,
  });

  if (!created.ok) return created;

  if (!created.data.url) {
    return {
      ok: false,
      code: "no_session_url",
      message: "Stripe created the session but returned no link to send.",
      retryable: true,
    };
  }

  return { ok: true, sessionId: created.data.id, url: created.data.url };
}

type SetupIntent = { id: string; payment_method: string | null; status: string };
type PaymentMethod = {
  id: string;
  card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number };
};

/**
 * Reads back what the client entered, once. Only references and the card
 * metadata Stripe reports come back across this boundary.
 */
export async function readSetupSession(
  sessionId: string
): Promise<
  | { ok: true; customerId: string | null; paymentMethodId: string; card: CardDetails }
  | StripeFailure
> {
  const session = await request<CheckoutSession & { customer: string | null }>(
    `/checkout/sessions/${sessionId}`,
    {},
    { method: "GET" }
  );
  if (!session.ok) return session;

  if (!session.data.setup_intent) {
    return {
      ok: false,
      code: "setup_incomplete",
      message: "The client has not finished adding a payment method yet.",
      retryable: true,
    };
  }

  const intent = await request<SetupIntent>(
    `/setup_intents/${session.data.setup_intent}`,
    {},
    { method: "GET" }
  );
  if (!intent.ok) return intent;

  if (!intent.data.payment_method) {
    return {
      ok: false,
      code: "setup_incomplete",
      message: "Stripe has no payment method against that session yet.",
      retryable: true,
    };
  }

  const method = await request<PaymentMethod>(
    `/payment_methods/${intent.data.payment_method}`,
    {},
    { method: "GET" }
  );
  if (!method.ok) return method;

  const customerId = session.data.customer;

  // Make it the customer's default so a charge does not have to guess.
  if (customerId) {
    await request(`/customers/${customerId}`, {
      invoice_settings: { default_payment_method: method.data.id },
    });
  }

  return {
    ok: true,
    customerId,
    paymentMethodId: method.data.id,
    card: {
      brand: method.data.card?.brand ?? null,
      last4: method.data.card?.last4 ?? null,
      expMonth: method.data.card?.exp_month ?? null,
      expYear: method.data.card?.exp_year ?? null,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Taking payment                                                              */
/* -------------------------------------------------------------------------- */

type PaymentIntent = {
  id: string;
  status: string;
  last_payment_error?: { code?: string; decline_code?: string; message?: string };
};

/**
 * Charges the stored method off-session. The idempotency key is derived from
 * the charge and the attempt number, so a duplicated job run or a restarted
 * process replays the original result instead of taking the money twice.
 */
export async function chargeCustomer(input: {
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  currency: string;
  description: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}): Promise<PaymentResult> {
  const created = await request<PaymentIntent>(
    "/payment_intents",
    {
      amount: input.amountCents,
      currency: input.currency,
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      description: input.description,
      confirm: true,
      off_session: true,
      metadata: input.metadata,
    },
    { idempotencyKey: input.idempotencyKey }
  );

  if (!created.ok) return created;

  if (created.data.status === "succeeded") {
    return { ok: true, reference: created.data.id };
  }

  const error = created.data.last_payment_error;
  const code = error?.decline_code ?? error?.code ?? created.data.status;

  return {
    ok: false,
    code,
    message:
      error?.message ??
      `Stripe left the payment in "${created.data.status}" rather than completing it.`,
    retryable: !PERMANENT_CODES.has(code),
  };
}

/**
 * Plain language for a client who has just been told their payment did not go
 * through. "generic_decline" helps nobody.
 */
export function explainFailure(code: string, message: string): string {
  switch (code) {
    case "expired_card":
      return "The card on file has expired.";
    case "card_declined":
    case "generic_decline":
      return "The card on file was declined by the bank.";
    case "insufficient_funds":
      return "The card on file was declined for insufficient funds.";
    case "incorrect_cvc":
    case "invalid_cvc":
      return "The security code on the card on file was not accepted.";
    case "authentication_required":
      return "The bank asked for authentication that cannot be given for an automatic payment.";
    case "processor_not_configured":
      return "The payment could not be attempted because no processor is configured.";
    case "processor_unreachable":
      return "The payment processor could not be reached.";
    default:
      return message;
  }
}

/** Whether the client should be asked to update their card rather than wait. */
export function isCardProblem(code: string): boolean {
  return (
    PERMANENT_CODES.has(code) ||
    code === "insufficient_funds" ||
    code === "authentication_required" ||
    code === "generic_decline"
  );
}
