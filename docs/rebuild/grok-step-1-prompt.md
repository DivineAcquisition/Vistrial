GROK PROMPT: VISTRIAL REBUILD, STEP 1 (WORKSPACE, ROLES, AND THE EMPTY SHELL), ALL ON CONVEX

Paste everything below into Grok. Attach `00-product-brief-and-step-1-spec.md` with it.

============================================================
YOUR ROLE
============================================================

You are building Step 1 of a fresh rebuild of Vistrial, a Sales OS. The attached brief and Step 1 spec are the source of truth. Build exactly what Step 1 asks for and nothing else. If something is missing or unclear, list it as a question in your plan and wait. Do not invent product decisions.

This is a new app in a new repository. Do not copy code from any earlier Vistrial codebase unless I paste it and tell you to.

============================================================
STACK (A FULL COMMITMENT TO CONVEX)
============================================================

- Convex is the entire backend: database, server functions, realtime, scheduled functions, file storage, and HTTP endpoints. There is no separate SQL database and no second backend. Do not add Supabase, Postgres, Prisma, or an ORM.
- Next.js (App Router) with TypeScript on Vercel for the front end only. It talks to Convex through the Convex client and server helpers.
- A hosted auth provider connected to Convex. I recommend Clerk. Propose your choice in the plan with the reason, and wait for my answer before building auth.
- Tailwind with shadcn-style components. Define design tokens once (color, type, spacing). Light theme by default, dark as an option. Calm, premium, quiet.

Your knowledge of Next.js and Convex may be out of date. Before you write any route, function, schema, or config, read the current official documentation for the exact versions you install (use Context7 or the official docs), and follow it. Use `convex-test` for tests.

============================================================
THE ONE THING YOU MUST GET RIGHT: ISOLATION
============================================================

Convex has no Row Level Security. Isolation between workspaces is code we write, so it is the heart of Step 1.

1. Build one access layer in `convex/lib/`. Every public query and mutation is created through shared builders (for example `workspaceQuery`, `workspaceMutation`, `staffQuery`). A builder resolves the signed-in identity, finds that person's membership in the workspace, checks the role, and gives the function a trusted context. If you use `convex-helpers` for custom functions, tell me first with its size and license.
2. A public function never accepts a role, member id, or workspace membership from its arguments. Role and membership always come from the access layer.
3. Every workspace table has `workspaceId` and reads go through an index that starts with it. No `.filter()` on large tables, no unbounded `.collect()`, lists are paginated.
4. A Rep's lead reads are scoped to their own leads inside the function, not on the screen.
5. Mutations write their audit row in the same mutation.
6. Logic that must not be called from a browser is an `internal` function. Outside services are called only from actions. Step 1 calls no outside services.
7. Add a guard test that fails the test run if any public function in `convex/` is not created through a builder.
8. Secrets live in Convex environment variables only. Add a check that fails the build if a secret reaches client code.

============================================================
STEP 0: PLAN FIRST (NO CODE YET)
============================================================

Reply with:
1. The repo structure you propose and why.
2. The Convex schema: every table, its validators, and its indexes, in plain words.
3. The access layer design: the builders, how identity and role are resolved, and the exact checks each one makes.
4. The auth provider choice, how its token reaches Convex, and how the second-factor claim is read for staff.
5. The route map: the customer app, and the separate staff surface for admin.vistrial.io, and how host separation works.
6. The registry design for the rail (the `agents` table) and how the shell reads it.
7. How staff access grants work end to end.
8. How the live side panel subscribes to the `events` table.
9. The test plan: how you will call every public function as a member of workspace A against workspace B's ids, and how the guard test works.
10. Every question or assumption you need me to confirm.

Wait for my approval before writing code.

============================================================
THEN BUILD, IN THIS ORDER
============================================================

1. Project setup, tokens, and CI that runs lint, type check, tests, and build. Two Convex deployments: dev and production.
2. The Convex schema, the seed function (the six agents, and two fake workspaces for tests only), and the access layer with its guard test.
3. Auth, workspace creation, invitations, and memberships.
4. Roles enforced on every function, the audit log, and the isolation and role tests passing.
5. The staff surface and the access-grant path, with the second-factor check.
6. The shell: registry-generated rail, setup path, empty decisions queue, command bar, crew band, briefing slot, due-now slot, and the live side panel on a reactive query, with every page as a real empty state.
7. Phone, tablet, and desktop layouts, theme switch, and the accessibility pass.

After each numbered part, stop and report: what changed, what you tested, and the exact commands to run it.

============================================================
RULES (NON-NEGOTIABLE)
============================================================

- Roles are Owner, Manager, Rep. Staff (Platform Admin, Service Team) are not workspace roles. They need an unexpired access grant and a second-factor claim, and every entry is logged.
- No agent runs in Step 1. Nothing is sent to anyone. No connection to any outside service.
- No message, transcript, or personal free text in the audit log or the `events` table. Ids, kinds, and counts only.
- The rail is generated from the `agents` table. Adding a row adds an agent with no code change.
- No hard-coded nav lists. No placeholder numbers that look real.
- Validators on every function argument and every table. No `v.any()` unless you explain why.
- Queries are deterministic and cheap. Do not read whole tables in one function.
- No em-dashes in any copy you write. Plain words, no jargon.
- Do not add features, libraries, or pages beyond the spec. Tell me before adding any dependency, with its size and license.

============================================================
DEFINITION OF DONE
============================================================

All ten acceptance tests in the spec pass. Report them one by one with the command and the result. Then list anything you were unsure about, anything you left out on purpose, and the dependencies you added with size and license.

============================================================
HOW I WILL REVIEW
============================================================

I will run the tests, read the access layer and every public function, try to read another workspace's data as each role, try to enter a workspace as staff without a grant or without a second factor, try to add a public function that skips the access layer, and check the shell at phone, tablet, and desktop widths. Anything that fails goes back to you before Step 2 starts.
