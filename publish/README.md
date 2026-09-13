# JanuaryAI Foundation — Summit 2027 site

Static site. No build step, no dependencies. Every page is plain HTML that runs
directly from the filesystem or any static host.

## Deploy

GitHub Pages: Settings → Pages → Deploy from branch → `main` / `/ (root)`.
Or drop this folder into Cloudflare Pages / Netlify / S3 as-is.

## Pages

| File | Page |
| --- | --- |
| index.html | Home — Majaii Lander (signup capture) |
| invitation.html | Invitation (full MAJAI lander) |
| home.html | JAI project home |
| summit.html | JanuaryAI Summit 2027 |
| global-ai-community.html | Global AI Community bubble field |
| charter.html | JanuaryAI Charter — all 13 sections |
| meeting-of-the-minds.html | Meeting of the Minds — impact groups |
| issues-topics-posts.html | The Commons — issues, topics, posts |
| open-letter.html | Open Letter + signing form |
| sponsors.html | Sponsorship tiers + RSVP |
| patron-account.html | Patron Account — monthly giving |
| sponsor-handout.html | Two-sided printable handout + agreement |
| contact.html | Contact, about, JAN |

## Assets

- `support.js` — page runtime, required by every page
- `image-slot.js` — image placeholder component
- `icons/`, `uploads/`, `LOGO majai*` — artwork

## Data

Signup and Open Letter forms write to InstantDB app `1610ad39-5a25-423e-913a-483b67bfed79`
(collections `signups`, `openLetter`) and mirror to localStorage first, so nothing is
lost if the network fails. Append `?admin=1` on the home page for the capture panel
and CSV download.

© 2026 DL Thomas. All Rights Reserved.
Produced by BODEN Summit LLC, 800 Beauprez Avenue, Lafayette, Colorado 80026.
