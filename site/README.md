# BSCH site

Three pages, built from this repo and served free on Cloudflare Pages.

| Page | Path | What it is |
| --- | --- | --- |
| Landing | `/` | Public. What BSCH is, what a build covers, how to hire. |
| Hire flow | `/flow.html` | Public. The flow chart of a whole case. |
| Staff SOP | `/shakbboenbraprtacg.html` | Unlisted. Built from `sop.md` in this repo. |

## The point of it

`sop.md` is the SOP. Editing that file and pushing updates the live page by itself,
so there is one copy of the procedure, not a repo copy and a Google Doc copy that
drift apart.

## Build it locally

```
cd site
npm install
npm run build
python -m http.server 8777 --directory dist
```

Then open http://localhost:8777.

## Deploy on Cloudflare (once)

The dashboard now routes static sites through Workers instead of Pages, so the
settings live in `wrangler.jsonc` at the repo root, pointing at `site/dist`.

1. dash.cloudflare.com -> **Workers & Pages** -> **Create** -> import this repo.
2. Project name: `bsch`. It has to match `name` in `wrangler.jsonc`, and it becomes the URL.
3. Build command: `cd site && npm install && npm run build`
4. Deploy command: leave `npx wrangler deploy` as it is.
5. Leave **Protect with Cloudflare Access** off, or the public pages ask for a login too.
6. **Deploy**. It goes live at `bsch.<your-subdomain>.workers.dev`.

Every push to `master` rebuilds and redeploys it. No other step.

Only `site/dist` is uploaded. The bot's own code is not served, and the bot keeps
running on the Raspberry Pi as before.

## The SOP link

The SOP page has no link pointing at it anywhere on the site, carries `noindex`
headers, and sits in `robots.txt`. That keeps it out of search results and away
from anyone poking around, but it is not a login: whoever has the link can read it.
Only hand it to staff.

To change the link, edit `SOP_PATH` in `build.js`, push, then update the bot with
`/config setting: Staff SOP document link`.
