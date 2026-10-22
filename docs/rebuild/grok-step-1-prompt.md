GROK PROMPT: VISTRIAL REBUILD, STEP 1 (WORKSPACE, ROLES, AND THE EMPTY SHELL)

Paste everything below into Grok. Attach `00-product-brief-and-step-1-spec.md` with it.

============================================================
YOUR ROLE
============================================================

You are building Step 1 of a fresh rebuild of Vistrial, a Sales OS. The attached brief and Step 1 spec are the source of truth. Build exactly what Step 1 asks for and nothing else. If something is missing or unclear, list it as a question in your plan and wait. Do not invent product decisions.

This is a new app in a new repository. Do not copy code from any earlier Vistrial codebase unless I paste it and tell you to.

============================================================
STACK
============================================================

- Next.js (App Router) with TypeScript, deployed on Vercel.
- Supabase for Postgres, Auth, and Row Level Security. It is the system of record.
- Convex is NOT part of Step 1. It is added later for the live agent stream.
- Tailwind with shadcn-style components. Define design tokens once (color, type, spacing). Light theme by default, dark as an option. Calm, premium, quiet.

Next.js in this project may differ from what you remember. Before you write any route, server code, or config, read the current official docs for the exact version you install, and follow them. Use Context7 or the official docs for every library you touch.

============================================================
STEP 0: PLAN FIRST (NO CODE YET)
============================================================

Reply with:
1. The repo structure you propose and why.
2. The migration list with the tables from the spec, and the Row Level Security policy for each table in plain words.
3. The route map: customer app, and the separate staff surface for admin.vistrial.io.
4. The registry design for the rail (the `agents` table) and how the shell reads it.
5. How staff access grants work end to end, including the second-factor requirement.
6. How you will test isolation against a real Postgres, not mocks.
7. Every question or assumption you need me to confirm.

Wait for my approval before writing code.

============================================================
THEN BUILD, IN THIS ORDER
============================================================

1. Project setup, tokens, CI that runs lint, type check, tests, and build.
2. Database migrations with a rollback for each, plus seed data (the six agents and two fake workspaces for tests).
3. Auth, workspace creation, invitations, and memberships.
4. Row Level Security and the audit log, with the isolation and role tests passing.
5. The staff surface and the access-grant path.
6. The shell: registry-generated rail, setup path, empty decisions queue, command bar, crew band, briefing slot, due-now slot, side panel, and every page as a real empty state.
7. Phone, tablet, and desktop layouts, theme switch, and the accessibility pass.

After each numbered part, stop and report: what changed, what you tested, and the exact commands to run it.

============================================================
RULES (NON-NEGOTIABLE)
============================================================

- Row Level Security is enabled on every table. A person reads only rows in a workspace they belong to and only what their role allows. Never use the service role in a request path that a customer triggers.
- Roles are Owner, Manager, Rep. Staff (Platform Admin, Service Team) are not workspace roles. They need an unexpired access grant, and every entry is logged.
- No agent runs in Step 1. Nothing is sent to anyone. No connection to any outside service.
- No message, transcript, or personal free text in logs.
- The rail is generated from the `agents` table. Adding a row adds an agent with no code change.
- No hard-coded nav lists. No placeholder numbers that look real.
- Tokens and secrets never reach client code. Add a check that fails the build if one does.
- No em-dashes in any copy you write. Plain words, no jargon.
- Do not add features, libraries, or pages beyond the spec. Tell me before adding any dependency, with its size and license.

============================================================
DEFINITION OF DONE
============================================================

All nine acceptance tests in the spec pass. Report them one by one with the command and the result. Then list anything you were unsure about, anything you left out on purpose, and the dependencies you added with size and license.

============================================================
HOW I WILL REVIEW
============================================================

I will run the tests, read the policies, try to read another workspace's data as each role, try to enter a workspace as staff without a grant, and check the shell at phone, tablet, and desktop widths. Anything that fails goes back to you before Step 2 starts.
