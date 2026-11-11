// A stand-in for Clerk's Frontend API, so the real clerk-js bundle can be driven through Vistrial's
// own sign-in and sign-up pages without a Clerk instance. It answers the handful of endpoints the
// pages use, with the shapes clerk-js 6 accepts. It is a stand-in: it proves the pages call Clerk in
// the right order and show the right words, not that a real instance is configured the same way.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Downloaded Clerk scripts are kept outside the repository.
const CACHE = path.join(os.tmpdir(), 'vistrial-auth-pages-check');
fs.mkdirSync(CACHE, { recursive: true });
const FAPI = 'https://fake-otter-12.clerk.accounts.dev';
const ORIGIN = 'http://localhost:3210';
const CODE = '424242';
function cdn(p) {
  const file = path.join(CACHE, p.replace(/[^a-zA-Z0-9._-]/g, '_'));
  if (!fs.existsSync(file)) {
    // Clerk serves its scripts from the instance's own address. Without an instance, take the same files from a public npm mirror.
    for (const host of ['https://unpkg.com', 'https://cdn.jsdelivr.net']) {
      try {
        execFileSync('curl', ['-fsSL', '--retry', '2', '-o', file, host + p.replace(/^\/npm/, host.includes('unpkg') ? '' : '/npm')]);
        if (fs.statSync(file).size > 10000) break;
      } catch {}
      fs.rmSync(file, { force: true });
    }
  }
  return fs.readFileSync(file);
}
const now = () => Date.now();
function verification(status = null, strategy = null, error = null) {
  return { object: 'verification', status, strategy, attempts: status ? 0 : null, expire_at: status ? now() + 600000 : null, error, nonce: null, message: null, external_verification_redirect_url: null };
}
function makeMock(config) {
  // config.accounts: { email: { password, emailCode, second: [], newDevice } }, config.signUp: { required: [] }
  const log = [];
  const state = { signIn: null, signUp: null, sessions: [], account: null, lastSession: null, users: {} };
  const user = (email) => ({ object: 'user', id: 'user_1', first_name: 'Jay', last_name: 'Brooks', username: null, image_url: '', has_image: false, primary_email_address_id: 'idn_1',
    email_addresses: [{ object: 'email_address', id: 'idn_1', email_address: email, verification: verification('verified', 'email_code'), linked_to: [] }], phone_numbers: [], web3_wallets: [], external_accounts: [], passkeys: [], enterprise_accounts: [], organization_memberships: [],
    password_enabled: true, two_factor_enabled: false, totp_enabled: false, backup_code_enabled: false, public_metadata: {}, unsafe_metadata: {}, created_at: now(), updated_at: now(), last_sign_in_at: now(), legal_accepted_at: null, create_organization_enabled: false, delete_self_enabled: false });
  const session = (email) => ({ object: 'session', id: 'sess_1', status: 'active', expire_at: now() + 86400000, abandon_at: now() + 86400000 * 7, last_active_at: now(), last_active_organization_id: null, actor: null, tasks: null,
    user: user(email), public_user_data: { first_name: 'Jay', last_name: 'Brooks', image_url: '', has_image: false, identifier: email }, factor_verification_age: [0, -1], created_at: now(), updated_at: now(),
    last_active_token: { object: 'token', jwt: fakeJwt() } });
  const client = () => ({ object: 'client', id: 'client_1', sessions: state.sessions, sign_in: state.signIn, sign_up: state.signUp, last_active_session_id: state.sessions[0]?.id ?? null, cookie_expires_at: null, captcha_bypass: false, created_at: now(), updated_at: now() });
  const wrap = (response) => ({ response, client: client() });
  const err = (status, code, param) => ({ status, body: { errors: [{ code, message: 'RAW CLERK MESSAGE ' + code, long_message: 'RAW CLERK LONG ' + code, meta: param ? { param_name: param } : {} }], clerk_trace_id: 'trace' } });
  if (config.signedIn) { state.email = 'jay@example.com'; state.sessions = [session(state.email)]; }
  function newSignIn(email) {
    const a = config.accounts[email];
    state.account = a; state.email = email;
    const first = [];
    if (a.password) { first.push({ strategy: 'password' }); first.push({ strategy: 'reset_password_email_code', email_address_id: 'idn_1', safe_identifier: email, primary: true }); }
    if (a.emailCode) first.push({ strategy: 'email_code', email_address_id: 'idn_1', safe_identifier: email, primary: true });
    state.signIn = { object: 'sign_in_attempt', id: 'sia_1', status: 'needs_first_factor', supported_identifiers: ['email_address'], identifier: email, user_data: { first_name: 'Jay', last_name: 'Brooks', image_url: '', has_image: false },
      supported_first_factors: first, supported_second_factors: null, first_factor_verification: null, second_factor_verification: null, created_session_id: null, abandon_at: now() + 600000 };
  }
  function passFirst() {
    const a = state.account; const s = state.signIn;
    if (a.second?.length) { s.status = 'needs_second_factor'; s.supported_second_factors = a.second.map((strategy) => strategy === 'phone_code' ? { strategy, phone_number_id: 'idn_p', safe_identifier: '+1 *** *** 0142', primary: true } : { strategy }); }
    else if (a.newDevice) { s.status = 'needs_client_trust'; s.supported_second_factors = [{ strategy: 'email_code', email_address_id: 'idn_1', safe_identifier: state.email }]; }
    else complete();
  }
  function complete() { const s = state.signIn; s.status = 'complete'; s.created_session_id = 'sess_1'; state.sessions = [session(state.email)]; }
  function handle(method, pathname, form) {
    log.push(`${method} ${pathname}${form.strategy ? ' strategy=' + form.strategy : ''}`);
    if (pathname === '/v1/environment') return { status: 200, body: environment(config) };
    if (pathname === '/v1/client' && method === 'GET') return { status: 200, body: { response: client(), client: null } };
    if (pathname === '/v1/client' && (method === 'POST' || method === 'PUT')) return { status: 200, body: { response: client(), client: null } };
    if (pathname === '/v1/dev_browser') return { status: 200, body: { id: 'dvb_1', token: 'dvb_token' } };
    if (pathname === '/v1/client/sign_ins' && method === 'POST') {
      if (form.strategy === 'oauth_google') {
        state.googleReturn = form.redirect_url; state.googleDone = form.action_complete_redirect_url;
        state.signIn = { object: 'sign_in_attempt', id: 'sia_g', status: 'needs_identifier', supported_identifiers: ['email_address'], identifier: null, user_data: null, supported_first_factors: null, supported_second_factors: null,
          first_factor_verification: { ...verification('unverified', 'oauth_google'), external_verification_redirect_url: ORIGIN + '/__fake_google' }, second_factor_verification: null, created_session_id: null, abandon_at: now() + 600000 };
        return { status: 200, body: wrap(state.signIn) };
      }
      const email = form.identifier;
      if (!config.accounts[email]) return err(422, 'form_identifier_not_found', 'identifier');
      newSignIn(email);
      if (form.password !== undefined) { if (form.password !== state.account.password) return err(422, 'form_password_incorrect', 'password'); passFirst(); }
      return { status: 200, body: wrap(state.signIn) };
    }
    let m;
    if ((m = pathname.match(/^\/v1\/client\/sign_ins\/[^/]+\/(prepare_first_factor|attempt_first_factor|prepare_second_factor|attempt_second_factor|reset_password)$/))) {
      const s = state.signIn; const op = m[1];
      if (op === 'prepare_first_factor') { if (config.sendFails) return err(429, 'too_many_requests'); s.first_factor_verification = verification('unverified', form.strategy); }
      if (op === 'attempt_first_factor') {
        if (form.strategy === 'password') { if (form.password !== state.account.password) return err(422, 'form_password_incorrect', 'password'); s.first_factor_verification = verification('verified', 'password'); passFirst(); }
        else { if (form.code === '000000') return err(422, 'verification_expired'); if (form.code !== CODE) return err(422, 'form_code_incorrect', 'code'); s.first_factor_verification = verification('verified', form.strategy);
          if (form.strategy === 'reset_password_email_code') s.status = 'needs_new_password'; else passFirst(); }
      }
      if (op === 'prepare_second_factor') s.second_factor_verification = verification('unverified', form.strategy);
      if (op === 'attempt_second_factor') { if (form.code !== CODE) return err(422, 'form_code_incorrect', 'code'); s.second_factor_verification = verification('verified', form.strategy); complete(); }
      if (op === 'reset_password') { if (form.password === 'password') return err(422, 'form_password_pwned', 'password'); state.account.password = form.password; passFirst(); }
      return { status: 200, body: wrap(s) };
    }
    if (pathname === '/v1/client/sign_ups' && method === 'POST') {
      const email = form.email_address;
      if (config.accounts[email]) return err(422, 'form_identifier_exists', 'email_address');
      if (form.password === 'password') return err(422, 'form_password_pwned', 'password');
      state.email = email;
      const missing = (config.signUp?.required ?? []).filter((f) => !form[f]);
      state.signUp = { object: 'sign_up_attempt', id: 'sua_1', status: 'missing_requirements', required_fields: ['email_address', ...(config.signUp?.required ?? [])], optional_fields: [], missing_fields: missing, unverified_fields: ['email_address'],
        verifications: { email_address: verification(null), phone_number: verification(null), web3_wallet: verification(null), external_account: null }, username: null, email_address: email, phone_number: null, web3_wallet: null,
        password_enabled: !!form.password, first_name: null, last_name: null, unsafe_metadata: {}, public_metadata: {}, custom_action: false, external_id: null, created_session_id: null, created_user_id: null, abandon_at: now() + 600000, legal_accepted_at: null };
      return { status: 200, body: wrap(state.signUp) };
    }
    if (/^\/v1\/client\/sign_ups\/[^/]+$/.test(pathname) && method === 'PATCH') {
      const s = state.signUp;
      if (form.password === 'password') return err(422, 'form_password_pwned', 'password');
      s.given = { ...(s.given || {}), ...form };
      if (form.password) s.password_enabled = true;
      s.missing_fields = (config.signUp?.required ?? []).filter((f) => !s.given[f] || s.given[f] === 'false');
      return { status: 200, body: wrap(s) };
    }
    if ((m = pathname.match(/^\/v1\/client\/sign_ups\/[^/]+\/(prepare_verification|attempt_verification)$/))) {
      const s = state.signUp;
      if (m[1] === 'prepare_verification') s.verifications.email_address = verification('unverified', 'email_code');
      else { if (form.code !== CODE) return err(422, 'form_code_incorrect', 'code'); s.verifications.email_address = verification('verified', 'email_code'); s.unverified_fields = []; s.status = 'complete'; s.created_session_id = 'sess_1'; s.created_user_id = 'user_1'; state.sessions = [session(state.email)]; }
      return { status: 200, body: wrap(s) };
    }
    if ((m = pathname.match(/^\/v1\/client\/sessions\/[^/]+\/(touch|tokens)$/))) {
      if (m[1] === 'tokens') return { status: 200, body: { object: 'token', jwt: fakeJwt() } };
      return { status: 200, body: wrap(state.sessions[0]) };
    }
    if (pathname.startsWith('/v1/client/sessions/') || pathname === '/v1/client/sessions') { state.sessions = []; return { status: 200, body: wrap({ object: 'session', id: 'sess_1', status: 'removed' }) }; }
    log.push('UNHANDLED ' + method + ' ' + pathname);
    return { status: 200, body: {} };
  }
  async function install(page) {
    await page.route(FAPI + '/**', async (route) => {
      const req = route.request(); const url = new URL(req.url());
      if (url.pathname.startsWith('/npm/')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: cdn(url.pathname) });
      const headers = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const form = Object.fromEntries(new URLSearchParams(req.postData() || ''));
      const method = url.searchParams.get('_method') || req.method();
      const out = handle(method, url.pathname, form);
      return route.fulfill({ status: out.status, contentType: 'application/json', headers, body: JSON.stringify(out.body) });
    });
    // Stands in for Google: decides how the visit ended, then sends the browser back the way Clerk would.
    await page.route(ORIGIN + '/__fake_google**', async (route) => {
      const s = state.signIn; state.email = 'jay@example.com'; state.account = config.accounts[state.email] || {};
      log.push('GOOGLE ' + config.google + ' return=' + state.googleReturn);
      if (config.google === 'cancel') s.first_factor_verification = verification('unverified', 'oauth_google', { code: 'oauth_access_denied', message: 'RAW CLERK MESSAGE oauth_access_denied', long_message: 'RAW CLERK LONG', meta: {} });
      else { s.first_factor_verification = verification('verified', 'oauth_google'); s.identifier = state.email; passFirst(); }
      return route.fulfill({ status: 302, headers: { location: s.status === 'complete' ? state.googleDone : state.googleReturn } });
    });
    await page.route('https://clerk-telemetry.com/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  }
  return { install, log, state };
}
function fakeJwt() {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const t = Math.floor(Date.now() / 1000);
  return `${b({ alg: 'RS256', typ: 'JWT', kid: 'ins_1' })}.${b({ sub: 'user_1', sid: 'sess_1', iss: FAPI, iat: t, nbf: t - 5, exp: t + 60, azp: ORIGIN })}.sig`;
}
function environment(config) {
  const attr = (enabled, extra = {}) => ({ enabled, required: enabled, used_for_first_factor: false, first_factors: [], used_for_second_factor: false, second_factors: [], verifications: [], verify_at_sign_up: false, ...extra });
  return {
    object: 'environment', id: 'env_1', maintenance_mode: false, client_debug_mode: false,
    auth_config: { object: 'auth_config', id: 'aac_1', single_session_mode: true, claimed_at: null, reverification: false, preferred_channels: null },
    display_config: { object: 'display_config', id: 'display_config_1', instance_environment_type: 'development', application_name: 'Vistrial', theme: {}, preferred_sign_in_strategy: 'password', logo_image_url: '', favicon_image_url: '', home_url: ORIGIN, sign_in_url: ORIGIN + '/sign-in', sign_up_url: ORIGIN + '/sign-up', user_profile_url: '', after_sign_in_url: ORIGIN + '/app', after_sign_up_url: ORIGIN + '/app', after_sign_out_one_url: '', after_sign_out_all_url: '', after_switch_session_url: '', after_create_organization_url: '', after_leave_organization_url: '', organization_profile_url: '', create_organization_url: '', branded: true, captcha_public_key: null, captcha_widget_type: null, captcha_public_key_invisible: null, captcha_provider: 'turnstile', captcha_oauth_bypass: [], captcha_heartbeat: false, support_email: '', clerk_js_version: '6', show_devmode_warning: false, google_one_tap_client_id: '', help_url: null, privacy_policy_url: '', terms_url: '', logo_url: null, favicon_url: null, logo_link_url: '', after_join_waitlist_url: '', waitlist_url: '' },
    user_settings: {
      attributes: { email_address: attr(true, { used_for_first_factor: true, first_factors: ['email_code'], verifications: ['email_code'], verify_at_sign_up: true }), phone_number: attr(false), username: attr(false), web3_wallet: attr(false), first_name: attr(false), last_name: attr(false), password: attr(true), authenticator_app: attr(false), backup_code: attr(false), passkey: attr(false), ticket: attr(false) },
      social: { oauth_google: { enabled: true, required: false, authenticatable: true, strategy: 'oauth_google', block_email_subaddresses: false, not_selectable: false, name: 'Google', logo_url: '' } },
      saml: { enabled: false }, enterprise_sso: { enabled: false },
      sign_in: { second_factor: { required: false, enabled: false } },
      sign_up: { captcha_enabled: false, captcha_widget_type: 'smart', custom_action_required: false, progressive: true, mode: 'public', legal_consent_enabled: false },
      restrictions: { allowlist: { enabled: false }, blocklist: { enabled: false }, block_email_subaddresses: { enabled: false }, block_disposable_email_domains: { enabled: false }, ignore_dots_for_gmail_addresses: { enabled: false } },
      password_settings: { disable_hibp: false, min_length: 8, max_length: 72, require_special_char: false, require_numbers: false, require_uppercase: false, require_lowercase: false, show_zxcvbn: false, min_zxcvbn_strength: 0, enforce_hibp_on_sign_in: false, allowed_special_characters: '' },
      username_settings: { min_length: 4, max_length: 64 }, passkey_settings: { allow_autofill: false, show_sign_in_button: false },
      actions: { delete_self: false, create_organization: false, create_organizations_limit: null },
      attack_protection: { user_lockout: { enabled: true, max_attempts: 100, duration_in_minutes: 60 }, pii: { enabled: false }, email_link: { require_same_client: false } },
    },
    organization_settings: { enabled: false, max_allowed_memberships: 5, actions: { admin_delete: false }, domains: { enabled: false, enrollment_modes: [], default_role: null }, force_organization_selection: false, slug: { disabled: true } },
    commerce_settings: { billing: { enabled: false, has_paid_user_plans: false, has_paid_org_plans: false, stripe_publishable_key: '', organization: { enabled: false, has_paid_plans: false }, user: { enabled: false, has_paid_plans: false } } },
    api_keys_settings: { enabled: false, user_api_keys_enabled: false, orgs_api_keys_enabled: false },
    protect_config: { object: 'protect_config', id: 'pc_1', loader: null },
    fraud_settings: { object: 'fraud_settings', native: { device_attestation_mode: 'disabled' } },
  };
}
export { makeMock, CODE };
