/**
 * Drives Vistrial's own sign-in and sign-up pages in a real browser, with the real clerk-js bundle
 * talking to the stand-in in mock.cjs. No Clerk keys are needed and no real account is touched.
 *
 *   PK="pk_test_$(printf 'fake-otter-12.clerk.accounts.dev$' | base64)"
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$PK NEXT_PUBLIC_CONVEX_URL=https://fake-test-000.convex.cloud npx next dev -p 3210
 *   node scripts/auth-pages-check/run.mjs
 *
 * Leave CLERK_SECRET_KEY unset so the proxy does not try a handshake with the made-up instance.
 * Needs Playwright with Chromium on the machine; it is not a project dependency.
 */
import { createRequire } from 'node:module';

import { CODE, makeMock } from './mock.mjs';

// Playwright is installed on the machine, not in this project, so it is found the way a script would find it.
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = 'http://localhost:3210';
const ME = 'jay@example.com';
let failures = 0;
const results = [];
function check(name, ok, detail = '') { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); if (!ok) failures++; }

async function open(browser, config, path) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const mock = makeMock(config);
  await mock.install(page);
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForFunction(() => { const b = document.querySelector('button[type=submit]'); return b && !b.disabled; }, null, { timeout: 30000 });
  return { ctx, page, mock, errors };
}
const h1 = (page) => page.locator('h1').first().textContent();
const alertText = async (page) => (await page.locator('[role=alert]').allTextContents()).join(' | ');
async function waitH1(page, text) { await page.waitForFunction((t) => document.querySelector('h1')?.textContent === t, text, { timeout: 15000 }); }
async function waitAlert(page) { await page.waitForFunction(() => [...document.querySelectorAll('[role=alert]')].some((n) => n.textContent.trim().length > 0), null, { timeout: 15000 }); return alertText(page); }
async function noRaw(page, name) { const body = await page.locator('body').innerText(); check(`${name}: no raw Clerk text on screen`, !/RAW CLERK|form_|verification_|_incorrect|api_response/i.test(body), body.slice(0, 200)); }
async function submit(page, label) { await page.getByRole('button', { name: label, exact: true }).click(); }
async function done(t, name, expectedPath) {
  await t.page.waitForURL((u) => u.pathname + u.search === expectedPath, { timeout: 20000 }).then(() => check(`${name}: lands on ${expectedPath}`, true)).catch(async () => check(`${name}: lands on ${expectedPath}`, false, t.page.url() + ' h1=' + (await h1(t.page)) + ' alert=' + (await alertText(t.page)) + ' log=' + t.mock.log.slice(-5).join(',')));
  check(`${name}: no page errors`, t.errors.length === 0, t.errors.join(' ; '));
  await t.ctx.close();
}

(async () => {
  const browser = await chromium.launch();

  { // 1. email + password, wrong then right, redirect_url kept
    const n = 'sign-in password';
    const t = await open(browser, { accounts: { [ME]: { password: 'correct horse' } } }, '/sign-in?redirect_url=%2Fapp%2Fresearch%3Ftab%3D2');
    await t.page.getByLabel('Email').fill(ME); await submit(t.page, 'Continue');
    await waitH1(t.page, 'Enter your password');
    check(`${n}: password box has focus`, await t.page.evaluate(() => document.activeElement?.getAttribute('name') === 'password'));
    check(`${n}: no "email me a code" when the account has no code sign-in`, (await t.page.getByText('Email me a code instead').count()) === 0);
    await t.page.getByLabel('Password', { exact: true }).fill('nope'); await submit(t.page, 'Sign in');
    const a = await waitAlert(t.page);
    check(`${n}: wrong password in plain words`, a.includes('That password is not right.'), a);
    check(`${n}: error tied to the field`, await t.page.evaluate(() => { const i = document.querySelector('input[name=password]'); const id = i.getAttribute('aria-describedby'); return i.getAttribute('aria-invalid') === 'true' && !!id && !!document.getElementById(id.split(' ')[0]); }));
    await noRaw(t.page, n);
    await t.page.getByLabel('Password', { exact: true }).fill('correct horse'); await submit(t.page, 'Sign in');
    await done(t, n, '/app/research?tab=2');
  }
  { // 2. code-only account: sent automatically, wrong, expired, paste with spaces auto-submits
    const n = 'sign-in email code';
    const t = await open(browser, { accounts: { [ME]: { emailCode: true } } }, '/sign-in');
    await t.page.getByLabel('Email').fill(ME); await t.page.keyboard.press('Enter');
    await waitH1(t.page, 'Check your email');
    check(`${n}: code was sent without asking`, t.mock.log.some((l) => l.includes('prepare_first_factor strategy=email_code')), t.mock.log.join(','));
    const code = t.page.getByLabel('Code');
    check(`${n}: code box is one-time-code and focused`, (await code.getAttribute('autocomplete')) === 'one-time-code' && await t.page.evaluate(() => document.activeElement?.getAttribute('name') === 'code'));
    await code.fill('111111');
    let a = await waitAlert(t.page);
    check(`${n}: wrong code in plain words`, a.includes('That code is not right.'), a);
    await code.fill(''); await code.fill('000000');
    await t.page.waitForFunction(() => document.body.innerText.includes('expired'), null, { timeout: 15000 }).catch(() => {});
    a = await alertText(t.page);
    check(`${n}: expired code offers a new one`, a.includes('That code has expired.') && a.includes('Send a new code'), a);
    check(`${n}: resend is held back by a timer`, /send a new one in 0:\d\d/.test(await t.page.locator('body').innerText()));
    await noRaw(t.page, n);
    await code.fill('');
    await t.page.evaluate(() => navigator.clipboard?.writeText?.('').catch(() => {}));
    await code.focus(); await t.page.evaluate((v) => { const i = document.querySelector('input[name=code]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }, 'Your code is 424 242');
    await done(t, n + ' (pasted "Your code is 424 242")', '/app');
  }
  { // 3. unknown email
    const n = 'sign-in unknown email';
    const t = await open(browser, { accounts: {} }, '/sign-in?redirect_url=%2Fjoin%3Ftoken%3Dabc');
    await t.page.getByLabel('Email').fill('nobody@example.com'); await submit(t.page, 'Continue');
    const a = await waitAlert(t.page);
    check(`${n}: account not found in plain words`, a.includes('No account uses that email.'), a);
    const href = await t.page.locator('[role=alert] a').getAttribute('href');
    check(`${n}: offers sign-up and keeps the invite`, href === '/sign-up?redirect_url=%2Fjoin%3Ftoken%3Dabc', href);
    check(`${n}: still on the email step`, (await h1(t.page)) === 'Open your organization');
    await noRaw(t.page, n);
    // client-side checks never reach Clerk
    const before = t.mock.log.length;
    await t.page.getByLabel('Email').fill('not-an-email'); await submit(t.page, 'Continue');
    check(`${n}: malformed email is caught on the page`, (await alertText(t.page)).includes('does not look like an email') && t.mock.log.length === before);
    await t.ctx.close();
  }
  { // 4. both methods + forgot password
    const n = 'sign-in forgot password';
    const t = await open(browser, { accounts: { [ME]: { password: 'old', emailCode: true } } }, '/sign-in');
    await t.page.getByLabel('Email').fill(ME); await submit(t.page, 'Continue');
    await waitH1(t.page, 'Enter your password');
    check(`${n}: offers a code when the account allows it`, (await t.page.getByText('Email me a code instead').count()) === 1);
    await t.page.getByRole('button', { name: 'Email me a code instead' }).click();
    await waitH1(t.page, 'Check your email');
    await t.page.getByRole('button', { name: 'Use your password instead' }).click();
    await waitH1(t.page, 'Enter your password');
    await t.page.getByRole('button', { name: 'Forgot password?' }).click();
    await waitH1(t.page, 'Reset your password');
    check(`${n}: reset code was sent`, t.mock.log.some((l) => l.includes('strategy=reset_password_email_code')));
    await t.page.getByLabel('Code').fill(CODE);
    await waitH1(t.page, 'Choose a new password');
    await t.page.getByLabel('New password').fill('short'); await submit(t.page, 'Save and sign in');
    check(`${n}: short password caught on the page`, (await alertText(t.page)).includes('at least 8 characters'));
    await t.page.getByLabel('New password').fill('password'); await submit(t.page, 'Save and sign in');
    const a = await waitAlert(t.page);
    check(`${n}: leaked password in plain words`, a.includes('shown up in a leak'), a);
    await noRaw(t.page, n);
    await t.page.getByLabel('New password').fill('a much better one'); await submit(t.page, 'Save and sign in');
    await done(t, n, '/app');
  }
  { // 5. two-step account
    const n = 'sign-in two-step';
    const t = await open(browser, { accounts: { [ME]: { password: 'pw', second: ['totp', 'phone_code', 'backup_code'] } } }, '/sign-in');
    await t.page.getByLabel('Email').fill(ME); await submit(t.page, 'Continue');
    await waitH1(t.page, 'Enter your password');
    await t.page.getByLabel('Password', { exact: true }).fill('pw'); await submit(t.page, 'Sign in');
    await waitH1(t.page, 'Two-step sign-in');
    check(`${n}: asks for the authenticator code first`, (await t.page.locator('body').innerText()).includes('authenticator app'));
    await t.page.getByLabel('Code').fill('123456');
    const a = await waitAlert(t.page);
    check(`${n}: wrong code in plain words`, a.includes('That code is not right.'), a);
    await t.page.getByRole('button', { name: 'Get a code by text message' }).click();
    await t.page.waitForFunction(() => document.body.innerText.includes('We texted a 6-digit code to +1 *** *** 0142'), null, { timeout: 15000 }).then(() => check(`${n}: text message option sends and says where`, true)).catch(async () => check(`${n}: text message option sends and says where`, false, await t.page.locator('body').innerText()));
    check(`${n}: text code was requested`, t.mock.log.some((l) => l.includes('prepare_second_factor strategy=phone_code')), t.mock.log.join(','));
    await t.page.getByRole('button', { name: 'Use your authenticator app' }).click();
    await t.page.waitForFunction(() => document.body.innerText.includes('authenticator app.'));
    await t.page.getByLabel('Code').fill(CODE);
    await done(t, n, '/app');
  }
  { // 6. new device
    const n = 'sign-in new device';
    const t = await open(browser, { accounts: { [ME]: { password: 'pw', newDevice: true } } }, '/sign-in');
    await t.page.getByLabel('Email').fill(ME); await submit(t.page, 'Continue');
    await waitH1(t.page, 'Enter your password');
    await t.page.getByLabel('Password', { exact: true }).fill('pw'); await submit(t.page, 'Sign in');
    await waitH1(t.page, 'Confirm it is you').then(() => check(`${n}: asks to confirm the device`, true)).catch(async () => check(`${n}: asks to confirm the device`, false, await h1(t.page)));
    check(`${n}: emailed code was requested`, t.mock.log.some((l) => l.includes('prepare_second_factor strategy=email_code')), t.mock.log.join(','));
    await t.page.getByLabel('Code').fill(CODE);
    await done(t, n, '/app');
  }
  { // 7. outside redirect is refused
    const n = 'sign-in outside redirect';
    const t = await open(browser, { accounts: { [ME]: { password: 'pw' } } }, '/sign-in?redirect_url=https%3A%2F%2Fevil.example%2Fapp');
    check(`${n}: sign-up link does not carry it`, (await t.page.getByRole('link', { name: 'Create an account' }).getAttribute('href')) === '/sign-up?redirect_url=%2Fapp');
    await t.page.getByLabel('Email').fill(ME); await submit(t.page, 'Continue');
    await waitH1(t.page, 'Enter your password');
    await t.page.getByLabel('Password', { exact: true }).fill('pw'); await submit(t.page, 'Sign in');
    await done(t, n, '/app');
  }
  { // 8. sign-up: email, password, code
    const n = 'sign-up password';
    const t = await open(browser, { accounts: { 'taken@example.com': { password: 'x' } }, signUp: { required: ['password'] } }, '/sign-up?redirect_url=%2Fjoin%3Ftoken%3Dabc');
    check(`${n}: bot-check mount point is on the page`, (await t.page.locator('#clerk-captcha').count()) === 1);
    await t.page.getByLabel('Email').fill('taken@example.com'); await submit(t.page, 'Continue');
    let a = await waitAlert(t.page);
    check(`${n}: email already used in plain words`, a.includes('That email already has an account.'), a);
    check(`${n}: offers sign-in and keeps the invite`, (await t.page.locator('[role=alert] a').getAttribute('href')) === '/sign-in?redirect_url=%2Fjoin%3Ftoken%3Dabc');
    await noRaw(t.page, n);
    await t.page.getByLabel('Email').fill('new+clerk_test@example.com'); await submit(t.page, 'Continue');
    await waitH1(t.page, 'Choose a password');
    check(`${n}: bot-check mount point survives the step change`, (await t.page.locator('#clerk-captcha').count()) === 1);
    await t.page.getByLabel('Password', { exact: true }).fill('password'); await submit(t.page, 'Create account');
    a = await waitAlert(t.page);
    check(`${n}: leaked password in plain words`, a.includes('shown up in a leak'), a);
    await t.page.getByLabel('Password', { exact: true }).fill('long enough words'); await submit(t.page, 'Create account');
    await waitH1(t.page, 'Check your email');
    check(`${n}: verification code was sent`, t.mock.log.some((l) => l.includes('prepare_verification')), t.mock.log.join(','));
    await t.page.getByLabel('Code').fill('111111');
    a = await waitAlert(t.page);
    check(`${n}: wrong code in plain words`, a.includes('That code is not right.'), a);
    await noRaw(t.page, n);
    await t.page.getByLabel('Code').fill(''); await t.page.getByLabel('Code').fill(CODE);
    await done(t, n, '/join?token=abc');
  }
  { // 9. sign-up on a code-only instance
    const n = 'sign-up code only';
    const t = await open(browser, { accounts: {}, signUp: { required: [] } }, '/sign-up');
    await t.page.getByLabel('Email').fill('new@example.com'); await submit(t.page, 'Continue');
    await waitH1(t.page, 'Check your email');
    await t.page.getByLabel('Code').fill(CODE);
    await done(t, n, '/app');
  }
  { // already signed in
    const n = 'already signed in';
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const mock = makeMock({ accounts: {}, signedIn: true }); await mock.install(page);
    await page.goto(BASE + '/sign-in?redirect_url=%2Fapp%2Fresearch', { waitUntil: 'load' });
    await page.waitForURL((u) => u.pathname === '/app/research', { timeout: 20000 }).then(() => check(`${n}: sent on to where they were headed`, true)).catch(() => check(`${n}: sent on to where they were headed`, false, page.url()));
    await ctx.close();
  }
  { // 10. Google, finished
    const n = 'google sign-in';
    const t = await open(browser, { accounts: { [ME]: {} }, google: 'ok' }, '/sign-in?redirect_url=%2Fapp%2Fresearch');
    await t.page.getByRole('button', { name: 'Continue with Google' }).click();
    await done(t, n, '/app/research');
    check(`${n}: came back through our callback page`, t.mock.log.some((l) => l.includes('return=http://localhost:3210/sign-in/sso-callback?from=sign-in&redirect_url=%2Fapp%2Fresearch')), t.mock.log.filter((l) => l.startsWith('GOOGLE')).join(','));
  }
  { // 11. Google, cancelled
    const n = 'google cancelled';
    const t = await open(browser, { accounts: { [ME]: {} }, google: 'cancel' }, '/sign-in?redirect_url=%2Fapp%2Fresearch');
    await t.page.getByRole('button', { name: 'Continue with Google' }).click();
    await t.page.waitForURL((u) => u.pathname === '/sign-in', { timeout: 20000 }).then(() => check(`${n}: returns to our sign-in page, not stuck on the callback`, true)).catch(() => check(`${n}: returns to our sign-in page, not stuck on the callback`, false, t.page.url()));
    const a = await waitAlert(t.page).catch(() => '');
    check(`${n}: says so in plain words`, a.includes('Google sign-in was cancelled.'), a);
    check(`${n}: keeps where the person was headed`, new URL(t.page.url()).searchParams.get('redirect_url') === '/app/research', t.page.url());
    await noRaw(t.page, n);
    await t.ctx.close();
  }
  { // 12. Google on a two-step account
    const n = 'google two-step';
    const t = await open(browser, { accounts: { [ME]: { second: ['totp'] } }, google: 'ok' }, '/sign-in');
    await t.page.getByRole('button', { name: 'Continue with Google' }).click();
    await waitH1(t.page, 'Two-step sign-in').then(() => check(`${n}: second step is shown after Google`, true)).catch(async () => check(`${n}: second step is shown after Google`, false, t.page.url() + ' ' + (await h1(t.page))));
    await t.page.getByLabel('Code').fill(CODE);
    await done(t, n, '/app');
  }
  { // 13. Google on a new device
    const n = 'google new device';
    const t = await open(browser, { accounts: { [ME]: { newDevice: true } }, google: 'ok' }, '/sign-in');
    await t.page.getByRole('button', { name: 'Continue with Google' }).click();
    await waitH1(t.page, 'Confirm it is you').then(() => check(`${n}: device check is shown after Google`, true)).catch(async () => check(`${n}: device check is shown after Google`, false, t.page.url() + ' ' + (await h1(t.page))));
    await t.page.getByLabel('Code').fill(CODE);
    await done(t, n, '/app');
  }
  // ---- account cards (Settings > You), mounted on their own at /dev/auth-pages?screen=account-live
  async function account(config) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 1400 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    const mock = makeMock({ accounts: {}, signedIn: true, ...config });
    await mock.install(page);
    await page.goto(BASE + '/dev/auth-pages?screen=account-live', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.innerText.includes('This device'), null, { timeout: 30000 });
    return { ctx, page, mock, errors };
  }
  const text = (page) => page.locator('body').innerText();
  const until = (page, words) => page.waitForFunction((w) => document.body.innerText.includes(w), words, { timeout: 15000 });
  const noClerkUi = async (t, name) => check(`${name}: no Clerk screen appears`, (await t.page.locator('[class*="cl-"]').count()) === 0);
  const end = async (t, name) => { check(`${name}: no page errors`, t.errors.length === 0, t.errors.join(' ; ')); await t.ctx.close(); };

  { // change password
    const n = 'account password';
    const t = await account({});
    await t.page.getByRole('button', { name: 'Change password' }).click();
    await t.page.getByLabel('Current password').fill('wrong one'); await t.page.getByLabel('New password').fill('brand new words');
    await t.page.getByRole('button', { name: 'Change password' }).click();
    let a = await waitAlert(t.page);
    check(`${n}: wrong current password in plain words`, a.includes('The current password is not right.'), a);
    await noRaw(t.page, n);
    await t.page.getByLabel('New password').fill('short'); await t.page.getByRole('button', { name: 'Change password' }).click();
    check(`${n}: short password caught on the page`, (await alertText(t.page)).includes('at least 8 characters'));
    await t.page.getByLabel('Current password').fill('old password'); await t.page.getByLabel('New password').fill('brand new words');
    await t.page.getByRole('button', { name: 'Change password' }).click();
    await until(t.page, 'Password changed.').then(() => check(`${n}: change is confirmed in words`, true)).catch(async () => check(`${n}: change is confirmed in words`, false, await alertText(t.page)));
    check(`${n}: Clerk was told to sign out other devices`, t.mock.acct.signedOutOthers === 'true' && t.mock.acct.password === 'brand new words');
    await t.page.waitForFunction(() => !document.body.innerText.includes('Safari on iPhone'), null, { timeout: 15000 }).then(() => check(`${n}: device list refreshes to this device only`, true)).catch(() => check(`${n}: device list refreshes to this device only`, false));
    await noClerkUi(t, n); await end(t, n);
  }
  { // Google-only account sets a first password
    const n = 'account set password';
    const t = await account({ user: { password: null } });
    check(`${n}: says there is no password yet`, (await text(t.page)).includes('No password yet.'));
    await t.page.getByRole('button', { name: 'Set a password' }).click();
    check(`${n}: does not ask for a current password`, (await t.page.getByLabel('Current password').count()) === 0);
    await t.page.getByLabel('New password').fill('first real password'); await t.page.getByRole('button', { name: 'Set password' }).click();
    await until(t.page, 'Password set.').then(() => check(`${n}: set`, true)).catch(async () => check(`${n}: set`, false, await alertText(t.page)));
    await end(t, n);
  }
  { // two-step on
    const n = 'account two-step on';
    const t = await account({});
    await t.page.getByRole('button', { name: 'Turn on' }).click();
    await until(t.page, 'JBSW Y3DP EHPK 3PXP').then(() => check(`${n}: shows the set-up key in groups`, true)).catch(async () => check(`${n}: shows the set-up key in groups`, false, await alertText(t.page)));
    check(`${n}: shows a scannable code`, (await t.page.locator('svg[aria-label="Set-up code for your authenticator app"] path').getAttribute('d'))?.length > 500);
    await t.page.getByLabel('Code from the app').fill('111111'); await t.page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
    const a = await waitAlert(t.page);
    check(`${n}: wrong code in plain words`, a.includes('That code is not right.'), a);
    await noRaw(t.page, n);
    await t.page.getByLabel('Code from the app').fill(CODE); await t.page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
    await until(t.page, 'aaaa1111').then(() => check(`${n}: backup codes are shown once it is on`, true)).catch(async () => check(`${n}: backup codes are shown once it is on`, false, await text(t.page)));
    await t.page.getByRole('button', { name: 'I have saved them' }).click();
    await until(t.page, 'New backup codes');
    check(`${n}: card now reads On`, /Two-step sign-in\s*\n\s*On\./.test(await text(t.page)) || (await text(t.page)).includes('On. After your password'));
    await noClerkUi(t, n); await end(t, n);
  }
  { // two-step: new codes, then off
    const n = 'account two-step off';
    const t = await account({ user: { totp: true, backup: true } });
    await t.page.getByRole('button', { name: 'New backup codes' }).click();
    await until(t.page, 'eeee5555').then(() => check(`${n}: new backup codes are shown`, true)).catch(async () => check(`${n}: new backup codes are shown`, false, await alertText(t.page)));
    await t.page.getByRole('button', { name: 'I have saved them' }).click();
    await t.page.getByRole('button', { name: 'Turn off' }).click();
    await until(t.page, 'Turn off two-step sign-in?');
    check(`${n}: asks before turning off`, t.mock.acct.totp === true);
    await t.page.getByRole('button', { name: 'Turn off' }).click();
    await until(t.page, 'Off. With it on').then(() => check(`${n}: turned off`, t.mock.acct.totp === false)).catch(async () => check(`${n}: turned off`, false, await alertText(t.page)));
    await end(t, n);
  }
  { // sign out another device
    const n = 'account devices';
    const t = await account({});
    check(`${n}: this device has no sign-out button of its own`, (await t.page.getByRole('button', { name: /^Sign out/ }).count()) === 2);
    await t.page.getByRole('button', { name: 'Sign out Safari on iPhone, Dallas, US' }).click();
    await t.page.waitForFunction(() => !document.body.innerText.includes('Safari on iPhone'), null, { timeout: 15000 }).then(() => check(`${n}: the device is signed out and leaves the list`, true)).catch(() => check(`${n}: the device is signed out and leaves the list`, false));
    check(`${n}: the other device is still listed`, (await text(t.page)).includes('Edge on Windows'));
    await end(t, n);
  }
  { // Clerk asks "is it you": our own window, password
    const n = 'account confirm it is you';
    const t = await account({ reverify: 'first' });
    await t.page.getByRole('button', { name: 'Turn on' }).click();
    await until(t.page, 'Confirm it is you').then(() => check(`${n}: our own check opens`, true)).catch(async () => check(`${n}: our own check opens`, false, await text(t.page)));
    await noClerkUi(t, n);
    const dialog = t.page.getByRole('dialog');
    await dialog.getByLabel('Password', { exact: true }).fill('nope'); await dialog.getByRole('button', { name: 'Confirm' }).click();
    const a = await waitAlert(t.page);
    check(`${n}: wrong password in plain words`, a.includes('That password is not right.'), a);
    await dialog.getByLabel('Password', { exact: true }).fill('old password'); await dialog.getByRole('button', { name: 'Confirm' }).click();
    await until(t.page, 'JBSW Y3DP EHPK 3PXP').then(() => check(`${n}: the change carries on by itself after the check`, true)).catch(async () => check(`${n}: the change carries on by itself after the check`, false, await text(t.page)));
    await t.page.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 10000 }).then(() => check(`${n}: the check window has closed`, true)).catch(() => check(`${n}: the check window has closed`, false));
    await end(t, n);
  }
  { // check with an emailed code, then a second step
    const n = 'account confirm with code and second step';
    const t = await account({ reverify: 'second', user: { totp: true, backup: true } });
    await t.page.getByRole('button', { name: 'New backup codes' }).click();
    await until(t.page, 'Confirm it is you');
    const dialog = t.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Email me a code instead' }).click();
    await until(t.page, 'We emailed a 6-digit code to j***@example.com').then(() => check(`${n}: emailed code offered and sent`, t.mock.log.some((l) => l.includes('verify/prepare_first_factor'))) ).catch(async () => check(`${n}: emailed code offered and sent`, false, await text(t.page)));
    await dialog.getByLabel('Code').fill(CODE); await dialog.getByRole('button', { name: 'Confirm' }).click();
    await until(t.page, 'Enter the 6-digit code from your authenticator app.').then(() => check(`${n}: second step asked for`, true)).catch(async () => check(`${n}: second step asked for`, false, await text(t.page)));
    await dialog.getByLabel('Code').fill(CODE); await dialog.getByRole('button', { name: 'Confirm' }).click();
    await until(t.page, 'eeee5555').then(() => check(`${n}: change completes after both steps`, true)).catch(async () => check(`${n}: change completes after both steps`, false, await text(t.page)));
    await end(t, n);
  }
  { // backing out of the check
    const n = 'account confirm cancelled';
    const t = await account({ reverify: 'first' });
    await t.page.getByRole('button', { name: 'Turn on' }).click();
    await until(t.page, 'Confirm it is you');
    await t.page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await t.page.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 10000 }).catch(() => {});
    check(`${n}: nothing changes and no error is shown`, (await alertText(t.page)).trim() === '' && !(await text(t.page)).includes('JBSW') && t.mock.acct.pendingTotp === false, await alertText(t.page));
    check(`${n}: the button works again`, !(await t.page.getByRole('button', { name: 'Turn on' }).isDisabled()));
    await end(t, n);
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log(results.join('\n')); console.error('CRASH', e.message.slice(0, 600)); process.exit(2); });
