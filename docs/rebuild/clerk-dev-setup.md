# Sign-in to the dev deployment with a Clerk development instance

Production sign-in (`clerk.vistrial.io`) cannot reach the Convex dev deployment. A Clerk **development** instance gives dev its own sign-in, so the real app can run against dev with real people signed in.

## What the code already does

`convex/auth.config.ts` uses `convex/lib/authIssuers.ts`:

- **Production, previews and any other deployment** accept production Clerk only. They never read `CLERK_DEV_ISSUER_DOMAIN`, so nothing has to be set there.
- **The dev deployment** (`grandiose-meerkat-838`) also accepts the Clerk instance named by `CLERK_DEV_ISSUER_DOMAIN`. Only `https://<name>.clerk.accounts.dev` domains are allowed. It is set to `none` on dev until the instance exists.

Convex refuses an auth config that reads a variable the deployment lacks. That was checked on dev, and it is why the variable is read only on dev.

## Steps (in the Clerk dashboard, owned by the business)

1. Open the Vistrial application in Clerk. Every Clerk application already has a **Development** instance next to Production. Switch to it with the toggle at the top. If you would rather keep dev users fully apart, create a new application named **Vistrial Dev** instead.
2. **Connect Convex.** Under Integrations, turn on **Convex**. Or create a JWT template named exactly `convex`. Either way the token audience must be `convex`.
3. **Add the second-factor claim**, the same as production: in the session token or `convex` template claims, add a boolean `secondFactor` from the user's two-factor enrollment. Staff screens refuse anyone without it.
4. **Copy two values. Neither is secret.**
   - The **Frontend API URL**, which looks like `https://happy-otter-12.clerk.accounts.dev`.
   - The **publishable key**, which starts with `pk_test_`.
   Send these two in the chat, or set the first yourself with `npx convex env set CLERK_DEV_ISSUER_DOMAIN https://<name>.clerk.accounts.dev` against dev.
5. **Keep the secret key out of chat.** The `sk_test_` key belongs only in your local `.env.local` as `CLERK_SECRET_KEY`. If an agent needs to sign in test users on its own, add it as a secret in this cloud environment's settings instead.

## Then

- Set `CLERK_DEV_ISSUER_DOMAIN` on dev to the Frontend API URL and push once, so the auth config picks it up.
- Run the app locally against dev with this in `.env.local`:
  ```
  NEXT_PUBLIC_CONVEX_URL=https://grandiose-meerkat-838.convex.cloud
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
  CLERK_SECRET_KEY=sk_test_...
  ```
  The site's Content-Security-Policy already allows `*.clerk.accounts.dev`.
- Sign up in the dev instance, then create a workspace from the app.
- For staff screens, enroll your dev user once: `npx convex run staffAdmin:enroll '{"userId":"<clerk user id>","role":"platform_admin"}'`.
