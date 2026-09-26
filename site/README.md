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

## Deploy on Cloudflare Pages (once)

1. Go to dash.cloudflare.com and sign in (a free account is enough).
2. **Workers & Pages** -> **Create** -> **Pages** -> **Connect to Git**.
3. Pick the `BSCH-Bot` repo and authorise Cloudflare to read it.
4. Set the build settings exactly:
   - Framework preset: **None**
   - Build command: `cd site && npm install && npm run build`
   - Build output directory: `site/dist`
5. **Save and Deploy**. A minute later the site is live at `<project>.pages.dev`.

Every push to `master` rebuilds it. No other step.

## The SOP link

The SOP page has no link pointing at it anywhere on the site, carries `noindex`
headers, and sits in `robots.txt`. That keeps it out of search results and away
from anyone poking around, but it is not a login: whoever has the link can read it.
Only hand it to staff.

To change the link, edit `SOP_PATH` in `build.js`, push, then update the bot with
`/config setting: Staff SOP document link`.
