# The JanuaryAI Project — majaii.com

Static site. No build step, no dependencies. Every page is a single self-contained
HTML file that runs from any static host.

## Deploy to Cloudflare Pages

Dashboard -> Workers & Pages -> Create -> Pages -> Upload assets.
Drag this whole folder in (or connect the repo and set build output = /).
No build command. No framework preset. Custom domain: www.majaii.com.

## Pages

| File | Page |
| --- | --- |
| index.html | Home — Issues, Topics, Posts (The Commons) |
| majaii.html | Majaii Lander (signup capture) |
| summit.html | JanuaryAI Summit 2027 |
| issues-topics-posts.html | The Commons — issues, topics, posts |
| invitation.html | Invitation (full lander) |
| open-letter.html | Library + Community Letters |
| sponsors.html | Donors, Sponsors, Partners |
| meeting-of-the-minds.html | Meeting of the Minds — impact groups |
| global-ai-community.html | Global AI Community |
| charter.html | JanuaryAI Charter — all 13 sections |
| contact.html | Contact, About JAI, JAN |
| privacy.html | Privacy Policy |
| home.html | JAI project home |
| patron-account.html | Patron Account — monthly giving |
| sponsor-handout.html | Two-sided printable handout + agreement |

## Assets

- `og-image.png` — 1200x630 link-preview card. Must stay at the site root
  (https://www.majaii.com/og-image.png) for iMessage/social previews to work.
- `icons/`, `uploads/`, `LOGO majai*` — artwork
- `support.js`, `image-slot.js` — kept for reference; the bundled pages inline them

Every page carries its own title, description, Open Graph and Twitter card tags.
Re-bundling a page resets its title to "Bundled Page" — re-apply the tags after.

## Data

Signup, Community Letter, and Commons forms write to InstantDB app
`1610ad39-5a25-423e-913a-483b67bfed79` (collections `signups`, `openLetter`, `commonsPosts`, `Guestlist`,
`pollVotes`, `pollVoteLog`, `adminNotes`, `members`, `memberLog`, `pledges`, `letterComments`) and mirror to localStorage first, so nothing is lost if the
network fails. Append `?admin=1` on the home page for the capture panel and CSV.

## Contact

cooper@tiino.ai · (303) 720-6633 · www.majaii.com

(c) 2026 DL Thomas. All Rights Reserved.
Produced by BODEN Summit LLC, 800 Beauprez Avenue, Lafayette, Colorado 80026.
