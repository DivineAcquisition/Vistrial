/**
 * Clerk's error codes turned into plain words, and the field each one belongs to.
 * The screens never show a Clerk code or Clerk's own sentence: an unknown code gets the fallback.
 */
export type AuthField = "email" | "password" | "code" | "name" | "form";

/** What the screen can offer next to the message. */
export type AuthProblemAction = "sign-in" | "sign-up" | "new-code" | "reset-password" | "start-over";

export type AuthProblem = {
  field: AuthField;
  message: string;
  action?: AuthProblemAction;
};

/** Where the failure happened, for codes that mean different things in different places. */
export type AuthErrorContext = {
  flow: "sign-in" | "sign-up";
  /** The field the person just filled in. Used when Clerk does not name one. */
  field: AuthField;
};

type ReadError = { code: string; param: string; lockoutSeconds: number | null };

function read(problem: unknown): ReadError | null {
  if (!problem || typeof problem !== "object") return null;
  const outer = problem as { code?: unknown; errors?: unknown; meta?: unknown; status?: unknown };
  const first = Array.isArray(outer.errors) && outer.errors.length > 0 ? (outer.errors[0] as typeof outer) : outer;
  const code = typeof first.code === "string" ? first.code : typeof outer.code === "string" ? outer.code : "";
  const meta = (first.meta ?? {}) as { paramName?: unknown; lockoutExpiresInSeconds?: unknown };
  const param = typeof meta.paramName === "string" ? meta.paramName : "";
  const lockout = typeof meta.lockoutExpiresInSeconds === "number" ? meta.lockoutExpiresInSeconds : null;
  if (!code && outer.status === 429) return { code: "too_many_requests", param, lockoutSeconds: lockout };
  return { code, param, lockoutSeconds: lockout };
}

function fieldForParam(param: string, fallback: AuthField): AuthField {
  if (param === "identifier" || param === "email_address") return "email";
  if (param === "password" || param === "new_password" || param === "current_password") return "password";
  if (param === "code") return "code";
  if (param === "first_name" || param === "last_name") return "name";
  return fallback;
}

/** "about 5 minutes", "about an hour". Never seconds: nobody plans around those. */
export function waitWords(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours <= 1 ? "about an hour" : `about ${hours} hours`;
}

const FALLBACK = "That did not work. Try again in a moment.";

export function explainAuthError(problem: unknown, context: AuthErrorContext): AuthProblem {
  const error = read(problem);
  if (!error || !error.code) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { field: "form", message: "You are offline. Check your connection and try again." };
    }
    return { field: "form", message: FALLBACK };
  }
  const { code, param } = error;
  const field = fieldForParam(param, context.field);

  switch (code) {
    // The email.
    case "form_identifier_not_found":
    case "invitation_account_not_exists":
      return { field: "email", message: "No account uses that email. Check the spelling, or create an account.", action: "sign-up" };
    case "form_identifier_exists":
    case "external_account_exists":
      return { field: "email", message: "That email already has an account. Sign in instead.", action: "sign-in" };
    case "form_param_format_invalid":
    case "form_param_value_invalid":
    case "form_param_unknown":
      if (field === "email") return { field, message: "That does not look like an email address." };
      if (field === "code") return { field, message: "That code is not right. Check it and try again." };
      if (field === "password") return { field, message: "That password cannot be used. Try a different one." };
      return { field, message: "Something in that answer is not right. Check it and try again." };
    case "form_param_nil":
    case "form_param_missing":
    case "form_conditional_param_missing":
      if (field === "email") return { field, message: "Enter your email address." };
      if (field === "password") return { field, message: "Enter your password." };
      if (field === "code") return { field, message: "Enter the code." };
      if (field === "name") return { field, message: "Enter your first and last name." };
      return { field, message: "Something is missing. Fill in the form and try again." };
    case "form_email_address_blocked":
    case "form_email_address_disposable_blocked":
    case "form_email_address_subaddress_blocked":
      return { field: "email", message: "That kind of email address cannot be used here. Use your usual work or personal email." };
    case "not_allowed_access":
    case "sign_up_mode_restricted":
    case "sign_up_mode_restricted_waitlist":
    case "sign_up_restricted_waitlist":
    case "signup_rate_limit_exceeded":
      return { field: "email", message: "New accounts are not open for that email right now. Ask the person who invited you, or write to us." };

    // The password.
    case "form_password_incorrect":
      return { field: "password", message: "That password is not right.", action: "reset-password" };
    case "form_password_or_identifier_incorrect":
      return { field: "password", message: "That email and password do not match.", action: "reset-password" };
    case "form_password_pwned":
    case "form_password_pwned__sign_in":
    case "form_password_compromised":
    case "form_password_compromised__sign_in":
      return context.flow === "sign-in"
        ? { field: "password", message: "That password has shown up in a leak elsewhere, so it is switched off. Choose a new one.", action: "reset-password" }
        : { field: "password", message: "That password has shown up in a leak elsewhere. Choose a different one." };
    case "form_password_length_too_short":
      return { field: "password", message: "That password is too short. Use at least 8 characters." };
    case "form_password_length_too_long":
    case "form_password_size_in_bytes_exceeded":
      return { field: "password", message: "That password is too long. Use a shorter one." };
    case "form_password_not_strong_enough":
    case "form_password_validation_failed":
    case "form_password_no_uppercase":
    case "form_password_no_lowercase":
    case "form_password_no_number":
    case "form_password_no_special_char":
      return { field: "password", message: "That password is too easy to guess. Use a longer one that mixes words, numbers and symbols." };
    case "strategy_for_user_invalid":
    case "form_password_not_set":
    case "no_password_set":
      return { field: "form", message: "This account does not sign in that way. Use the code we email you, or Google.", action: "start-over" };

    // The code.
    case "form_code_incorrect":
    case "verification_code_incorrect":
    case "backup_code_incorrect":
      return { field: "code", message: "That code is not right. Check it and try again." };
    case "verification_expired":
    case "verification_code_expired":
      return { field: "code", message: "That code has expired. Send a new one.", action: "new-code" };
    case "verification_failed":
    case "too_many_attempts":
    case "verification_max_attempts":
      return { field: "code", message: "Too many wrong tries. Send a new code and use that one.", action: "new-code" };
    case "verification_already_verified":
      return { field: "form", message: "That is already confirmed. Start again to finish signing in.", action: "start-over" };

    // Slowed down or locked.
    case "too_many_requests":
    case "rate_limit_exceeded":
      return { field: "form", message: "Too many tries in a short time. Wait a minute, then try again." };
    case "user_locked":
      return {
        field: "form",
        message: error.lockoutSeconds
          ? `This account is locked after too many wrong tries. Try again in ${waitWords(error.lockoutSeconds)}.`
          : "This account is locked after too many wrong tries. Try again later, or write to us.",
      };
    case "user_banned":
    case "user_deactivated":
      return { field: "form", message: "This account is switched off. Write to us if that is a mistake." };

    // Google.
    case "oauth_access_denied":
    case "oauth_callback_cancelled":
    case "access_denied":
      return { field: "form", message: "Google sign-in was cancelled. Try again, or use your email." };
    case "external_account_not_found":
      return { field: "form", message: "No account uses that Google account yet. Create an account first.", action: "sign-up" };
    case "oauth_provider_not_enabled":
    case "strategy_not_allowed":
    case "strategy_not_enabled":
    case "oauth_shared_credentials_blocked":
    case "oauth_misconfigured_provider":
      return { field: "form", message: "Google sign-in is not switched on yet. Use your email instead." };
    case "oauth_email_domain_reserved_by_saml":
    case "external_account_email_address_verification_required":
    case "external_account_missing_refresh_token":
    case "oauth_identification_claimed":
    case "identification_claimed":
      return { field: "form", message: "That Google account could not be used. Sign in with your email instead." };

    // Account settings.
    case "form_password_validation_incorrect":
    case "form_current_password_incorrect":
      return { field: "password", message: "The current password is not right." };
    case "form_new_password_matches_current":
      return { field: "password", message: "That is the password you already have. Choose a different one." };
    case "totp_already_enabled":
      return { field: "form", message: "Two-step sign-in is already on. Refresh the page to see it." };
    case "feature_not_enabled":
    case "totp_not_enabled":
    case "backup_codes_not_enabled":
    case "second_factor_not_enabled":
      return { field: "form", message: "Two-step sign-in is not switched on for Vistrial yet. Write to us and we will turn it on." };
    case "session_reverification_required":
    case "reverification_required":
      return { field: "form", message: "This needs you to confirm it is you first. Try again." };
    case "cannot_revoke_current_session":
      return { field: "form", message: "That is this device. Use Sign out instead." };

    // The attempt itself.
    case "session_exists":
    case "identifier_already_signed_in":
    case "already_signed_in":
      return { field: "form", message: "You are already signed in. Open your organization." };
    case "client_state_invalid":
    case "sign_in_no_identification_for_user":
    case "resource_not_found":
    case "sign_up_not_found":
    case "sign_in_not_found":
    case "sign_up_cannot_be_updated":
      return { field: "form", message: "This took too long and has to start again.", action: "start-over" };
    case "captcha_invalid":
    case "captcha_unavailable":
    case "captcha_not_enabled":
    case "captcha_missing_token":
    case "action_blocked":
    case "requires_captcha":
    case "protect_check_aborted":
      return { field: "form", message: "The check that you are a person did not finish. Turn off any ad blocker for this page and try again." };
    case "network_error":
    case "clerk_offline":
    case "fetch_failed":
      return { field: "form", message: "The sign-in service could not be reached. Check your connection and try again." };
    default:
      return { field: "form", message: FALLBACK };
  }
}
