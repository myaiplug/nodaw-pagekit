# Third-party notices

Uses pagekit by wavey-ai (MIT) — https://github.com/wavey-ai/pagekit @ cd4740e1a04b.
The MIT license text (Copyright (c) 2026 Latched Page Kit contributors) is in `LICENSE`.

NoDAW Labs changes on top of upstream:
- `src/page.html`: NoDAW header/footer, robots, canonical, Open Graph and Twitter card tags, favicon; admin link and its script are wrapped in `<!--LPK_ADMIN-->` markers (shown only on localhost in dev, stripped from deploy builds).
- `src/nodaw-theme.css`: NoDAW dark theme + call-to-action button styles.
- `src/page-renderer.js`: optional per-section `actions` (call-to-action links).
- `src/admin/admin.js`, `scripts/dev-server.mjs`: keep `actions` and page `meta` when the local editor saves.
- `scripts/build.mjs`: `meta` placeholders and a `--no-admin` flag for public deploy builds (no admin pages, no admin link/script, no `kit/admin` bundle).
- `src/nodaw-theme.css`: solid backdrop on the sticky brand bar.
- `public/robots.txt`, `public/sitemap.xml`, `public/favicon.*`, `vercel.json` (root redirects to the page; no admin routes are deployed).

Product facts on `public/pages/liminal-pro.json` come only from https://liminal-stemsplit.onrender.com and the two
Gumroad listings (Pro $29: https://nodaw.gumroad.com/l/LiminalPro, free demo: https://nodaw.gumroad.com/l/Liminal).
Screenshots are the real app captures served by that site.
The 30-day money-back guarantee wording matches https://liminal-stemsplit.onrender.com/refund.html.
The Open Graph image `og-hero.jpg` is the Liminal Pro Gumroad hero (1280x720 real app UI), resized to 1200x630 JPEG.
