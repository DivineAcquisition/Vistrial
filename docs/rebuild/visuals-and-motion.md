# Visuals and motion

These are the owner's choices, made after a search of 21st.dev for empty states, banners, badges and motion. The ideas came from components such as Illos AI Chat Empty State, Dub's Banner, diceui Status, unlumen Tag and Scroll Reveal. They are built in-house on what the app already has (`motion`, `Skeleton`, `NumberTicker`, `AnimatedShinyText`), so nothing new is installed.

The story page is `/dev/visuals?part=tags|banners|empty|motion`.

## Empty pages: a faded preview of what's coming

`EmptyState` takes a `preview` prop: `cards`, `rows`, `facts` or `board`. The empty page shows a faded, shimmering sketch of the content it will hold. The Vistrial mark, a line saying what will appear, and a **Start a session** button sit over the sketch.

The "NOTHING TO SHOW" caption is gone. The preview kinds are used here:

| Page | Preview |
| --- | --- |
| Decisions | rows |
| All research | cards |
| All activity | rows |
| All assets | rows |
| Agent sessions | cards |
| Agent reports | rows |
| Agent memory | facts |
| Agent activity | rows |
| Research board | board |
| Day, Team, Settings | rows |

Permission and error states keep their plain icon, because a preview would suggest content the person can't have.

![Empty pages](../screenshots/visuals-empty.png)

## Status tags, not ovals

`Badge` now has square corners (6px) instead of pill corners. `StatusBadge` shows an icon in place of the dot:

- a spinning ring while work runs;
- a check when it's done;
- a clock while it waits;
- an hourglass for "coming soon";
- a warning sign when it fails;
- a cross when it's stopped or off.

The icon is read from the label, so existing call sites didn't change. Pass `icon` to override it.

![Status tags](../screenshots/visuals-tags.png)

## Banners

`Banner` (`src/components/ui/banner.tsx`) has a soft gradient wash, a faint grid, an icon tile, a title, one line and an optional action. Its tones are brand, warning, critical, good and neutral, and `compact` gives a smaller version for use inside cards. It's used for:

- the session's "Working on it" and "Waiting for your answer" notices;
- the plan's "Assumed" note;
- the run viewer's "Reconnecting" alert;
- the Meta connection notices.

![Banners](../screenshots/visuals-banners.png)

## Motion

Every animation respects the system's reduced-motion setting.

- **Page entrance.** `PageEnter` fades and unblurs each page as you open it. It's applied once in the product shell.
- **Lists.** `Stagger` and `StaggerItem` make cards and rows cascade in. They use layout animation, so new items slide in, removed ones fade out, and the rest move into place. They're used on Decisions, All research, All assets, agent sessions, reports and memory, and the agent overview.
- **Hover depth.** `HoverLift` lifts a card slightly, with a spotlight that follows the pointer. It's on session cards and asset rows.
- **Live indicators.**
  - Spinning rings in "running" tags and in the Working banner.
  - Shimmering "Working…" text on follow-ups.
  - Count-up numbers on the agent overview.
