# First working paths: transcripts, Google Calendar, Calendly

Date: 2026-11-11. The three paths that need no outside approval, built on `integrations-groundwork.md`.
Owner steps are in `integrations-setup.md`. Nothing here was run against a real provider.

## Upload or paste a transcript

**Settings → Data → More connections**, under AI note takers. No setup, no key.

- An Owner or Manager gives a title, the tool, an optional call date, and either a `.txt`, `.vtt`, `.srt`
  or `.md` file or pasted text, and ticks the confirmation that the call was recorded lawfully. The file
  is read in the browser; only its text is sent.
- Subtitle files lose cue numbers and timestamps; speakers and words stay. Audio, video or any other
  binary sent as text is refused, as is an empty or far too long one (600 KB of text; a workspace keeps
  up to 200).
- Kept: the text, title, tool, call date, who added it, and when they confirmed. Shown as **Your data**,
  with its title, tool, date and length; the text itself is not shown on the card.
  Reps see the list but not the full text and cannot add or delete.
- **As evidence:** like a results file, each transcript granted to an agent (Growth Architect by default)
  is saved on a research project as a `customerData` source, so a claim labelled **Your data** can cite
  it. Up to the 5 newest per run. The source carries the first 300 characters and the limitation "one call
  is not a pattern".
- Delete removes the text. Reports already written keep their citation and short quote.

| Piece | File |
|---|---|
| Table `callTranscripts` (new) | `convex/schema.ts` |
| `add`, `list`, `read`, `remove`, `setAgentAccess`, `saveTranscriptSourcesFor` | `convex/transcripts.ts` |
| Cleaning and refusals | `convex/lib/transcriptText.ts` |
| Evidence hook (5 lines) | `convex/lib/businessContext.ts` |
| Screen | `src/components/connections/transcripts-view.tsx` |

**Limit to know:** an agent does not yet read a whole transcript. It gets the source with its opening 300
characters, the same size every other source gets. Reading the full text to find what prospects say most
often is the next step, and the reason to hold transcripts at all.

## Google Calendar and Calendly

Behind their settings. Once connected, the calendar is read straight away, then every 6 hours, and when an
Owner or Manager presses **Refresh**. The window is the last 90 days and the next 30.

**The card is simple on purpose** (owner's direction, 2026-11-11): logo and name, one line on what is read,
status, when it was last read, and Connect / Refresh / Disconnect. No counts, tables or breakdowns. The
counts are still read and stored exactly as described below, and `bookings.view` still returns them, for
the Sales conversion area that will present them. A connected calendar's card says "Booked-call numbers
will appear in Sales conversion."

| | Google Calendar | Calendly |
|---|---|---|
| Asked of the provider | Each event's time, type, status, and guests' email addresses and replies. Titles, descriptions, locations and guest names are never requested (`fields=`) | The connected person's scheduled events; then invitees of the 30 most recent past calls, to see a no-show mark |
| Counted as a call | A meeting at a set time with at least one guest outside the owner's email domain (anyone, if the owner uses a public mail domain) | Every scheduled event |
| Kept | Per week: booked, cancelled, declined by every outside guest | Per week and per event type: booked, cancelled, marked no-show |
| Not kept | Anything about who or what | Invitee names, emails, answers, meeting links |
| Cannot show | Whether anyone showed up | A no-show the host did not mark |

Guests' email addresses are used in memory to tell an outside guest from a colleague and are not stored.
Disconnect deletes the counts with the token.

| Piece | File |
|---|---|
| Pure reducers from events to counts | `convex/lib/integrations/bookings.ts` |
| `syncNow`, `view`; internal `syncOne`, `syncAll` (every 6 hours) | `convex/bookings.ts`, `convex/crons.ts` |
| First read after sign-in | `convex/integrationHttp.ts` |
| Screen | The provider card in `src/components/connections/integrations-view.tsx` (status and Refresh only) |

**Limits to know:**

- The counts are not shown anywhere yet. They are stored for the Sales conversion area, are not yet a
  source an agent can cite, and are not yet joined to ad results (cost per booked call).
- What a calendar cannot show (who turned up; a no-show the host did not mark) is no longer said on the
  card. It needs saying wherever the numbers are shown.
- Weeks are Monday to Sunday in UTC, not the workspace's time zone.
- Google: `calendar.events.owned.readonly` is the narrowest scope that should work; that it returns guests
  and cancelled events the same way as the wider scope is not verified. Cancelled meetings are counted
  only while Google still lists them.
- One read takes at most 2,000 Google events or 1,000 Calendly events; beyond that the screen says the
  earliest are not counted.

## Privacy policy (proposed, in its own commit)

Parts J (Connected calendars) and K (Call transcripts) in section 3, two retention lines, one line on the
data requests page, and the date moved to November 11, 2026. The Google paragraph states Limited Use. It
does not say "not used to train AI", because the policy's tests allow that sentence only when the
`aiNoTraining` switch is on.

Story page: `/dev/integrations?state=connected` (and `none`, `ready`, `returned`; `role=rep`; `theme=dark`).
