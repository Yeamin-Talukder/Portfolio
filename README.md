# Yeamin Talukder — Portfolio

Live: https://yh-am-in.netlify.app/

A solar-system themed portfolio: your avatar is the sun, your skills orbit it, and the
background is a parallax starfield with shooting stars. On phones it behaves like a native
app — top app bar, bottom tab bar, swipe between screens, a “More” sheet — and it can be
installed to the home screen (PWA).

Everything on the site is editable from the built-in admin panel.

## Structure

```
index.html            site shell (content is rendered by js/app.js)
admin.html            admin panel — “Mission Control”
data/content.js       ALL site content (edited by the admin panel)
css/style.css         site styles (desktop + mobile app mode)
css/admin.css         admin styles
js/app.js             renders the site, live Codeforces/GitHub stats, mobile app shell
js/starfield.js       animated star background (shared by site + admin)
js/admin.js           admin panel logic
js/icons.js           icon list for the admin icon picker
uploads/              files uploaded from the admin panel (created on first upload)
js/seo.js             builds meta tags, structured data & a crawlable copy of the content
tools/build-seo.js    regenerates the SEO blocks in index.html + sitemap.xml locally
img/logo.svg          logo (app icon); img/favicon.svg = small-size favicon
manifest.webmanifest  PWA manifest
sw.js                 network-first service worker (offline fallback)
robots.txt, sitemap.xml, 404.html, _headers   SEO / Netlify files
```

## Admin panel

Open `/admin.html` (e.g. https://yh-am-in.netlify.app/admin.html).

1. Create a GitHub **fine-grained token**:
   GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*
   - Repository access: only this portfolio repo
   - Permissions → Repository → **Contents: Read and write**
2. Paste it into the admin login. It is stored only in your browser.
3. Edit anything — profile, avatar, résumé, orbit planets, about, skills, projects,
   achievements, education, socials, section order/visibility, mobile tabs, theme colors,
   motion, SEO.
4. Watch the live preview (desktop or phone frame), then click **Publish** (or `Ctrl+S`).
   This makes one commit with `data/content.js` plus any uploaded files, and Netlify
   redeploys automatically (about a minute).

Drafts auto-save in your browser, so you can close the tab and continue later.
**Offline mode** (no token) lets you edit and preview, then download `content.js` or a
JSON backup to apply manually.

## SEO

`index.html` contains generated blocks between `<!-- SEO:HEAD:* -->` and `<!-- SEO:BODY:* -->`
(meta tags, Open Graph, JSON-LD `ProfilePage`/`Person`, and a plain-HTML copy of the content for
crawlers). Publishing from the admin regenerates them and `sitemap.xml` automatically. If you edit
`data/content.js` by hand, run:

```bash
node tools/build-seo.js
```

Google Search Console is verified with `google37d6bfa5bc028c76.html`; submit `sitemap.xml` there.

## Local development

Any static server works, for example:

```bash
python -m http.server 5500
```

Then open http://localhost:5500 and http://localhost:5500/admin.html.
