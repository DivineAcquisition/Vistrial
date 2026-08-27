# HighLevel Marketplace listing assets

Live HighLevel listings serve preview shots as **960×540 PNG** (16:9). Logos on the listing form are square **PNG** (400–800px is the usual range). These files match that.

## Logo

| File | Size |
|---|---|
| `logo-800.png` | 800×800, crest on ink `#07070b` |
| `logo-512.png` | 512×512, same treatment |

No transparency. Some marketplace uploaders reject alpha.

## Preview images (the app, not the marketing site)

Four in-app screens, labeled SAMPLE, using the public demo case (not a real client).

| Shot | 1280×720 | 960×540 (listing size) |
|---|---|---|
| Queue with an alarm row | `preview-queue-1280x720.png` | `preview-queue-960x540.png` |
| Case file + readiness | `preview-case-1280x720.png` | `preview-case-960x540.png` |
| Pre-call brief | `preview-brief-1280x720.png` | `preview-brief-960x540.png` |
| Follow-up draft to approve | `preview-follow-up-1280x720.png` | `preview-follow-up-960x540.png` |

If the developer portal specifies 960×540, upload that column. If it only asks for 16:9 / PNG, use 1280×720.

## Regenerating

In `next dev`, open `/preview/marketplace/{queue,case,brief,follow-up}`. That route 404s in production.
