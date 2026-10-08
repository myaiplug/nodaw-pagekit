# NoDAW pagekit

NoDAW Labs product pages, built on [wavey-ai/pagekit](https://github.com/wavey-ai/pagekit) (MIT, see `LICENSE` and `THIRD_PARTY_NOTICES.md`).

- Live: https://nodaw-pagekit.vercel.app/liminal-pro/ (Liminal Pro)
- Pages are JSON files in `public/pages/<slug>.json`; media lives in `public/assets/pages/<slug>/`.
- Page `meta` supports `robots`, `canonical`, `siteName`, `ogImage` (absolute URL), `ogImageWidth`, `ogImageHeight`, `ogImageAlt`, `brand`, `brandHref`. Sections can carry `actions` (`{ label, href, style: "primary" | "secondary", note }`).
- `npm run dev` runs the local editor at `http://localhost:5179/admin/<slug>/` (dev server only).
- Production (Vercel) runs `npm run build:deploy` (`--no-admin`), which removes the editor link, the editor script and the admin bundle, and `/admin/*` redirects to the page.

---

Upstream README:

## pagekit

Reusable static page templates extracted from the Bitneedle splash page.

It gives you:

- a JSON-driven public page renderer
- the mobile "latch" effect where copy sticks onto media while scrolling
- a local-only admin editor at `/admin/<page>/`
- image resizing/cropping in the browser before save
- a Node dev server that writes JSON and media into `public/`
- a static `dist/` build you can deploy anywhere

No framework or runtime dependencies are required.

## Quick Start

```sh
npm run dev
```

Open:

- `http://localhost:5179/splash/` for the sample page
- `http://localhost:5179/admin/splash/` to edit it locally

The admin save endpoint only exists in the dev server. It writes:

- `public/pages/<page>.json`
- `public/assets/pages/<page>/...`

Build deployable static files:

```sh
npm run build
```

Deploy `dist/` with any static host.

## Content Model

Each page is a JSON file in `public/pages/`.

```json
{
  "version": 1,
  "title": "splash",
  "description": "Short page description",
  "sections": [
    {
      "id": "section-intro",
      "photoCredit": "Photo by Example Artist.",
      "headline": "make it visible",
      "lede": "Short high-impact copy.",
      "body": "Long-form copy. Use **bold**, *emphasis*, ==highlight==, and ### headings.",
      "images": [
        { "src": "assets/pages/splash/poster.svg", "alt": "Poster", "format": "portrait" }
      ],
      "bullets": [
        { "type": "text", "text": "A concise point.", "icon": "core" }
      ]
    }
  ]
}
```

Supported section image formats are `portrait`, `square`, and `wide`.

## Reuse In Another Site

Copy or publish the files under `src/` and include:

```html
<link rel="stylesheet" href="/kit/page-template.css">
<main class="lpk-main" data-lpk-page="splash">
  <div class="lpk-section-list" data-lpk-sections></div>
</main>
<script type="module" src="/kit/page-renderer.js"></script>
```

The renderer fetches `/pages/splash.json` by default. Set
`data-lpk-json="/path/to/page.json"` on the main element to override it. Set
`data-lpk-asset-base="./"` when relative asset paths should resolve beside the
current page instead of from the domain root.

For the admin UI, put configuration on the body or another `[data-lpk-admin]`
element:

```html
<body
  class="lpk-admin-page"
  data-lpk-admin
  data-lpk-page="splash"
  data-lpk-json="./splash/splash.json"
  data-lpk-admin-data="/admin/splash/data"
  data-lpk-preview-path="./"
  data-lpk-save-label="web/splash/splash.json">
```

## Styling

The kit is controlled by CSS custom properties. Override these in your host app:

```css
:root {
  --lpk-bg: #ff2e88;
  --lpk-ink: #101010;
  --lpk-accent: #fff252;
  --lpk-accent-deep: #ef3b35;
  --lpk-font: system-ui, sans-serif;
}
```

The latch behavior is bound to the renderer's section markup. If you render your
own HTML, keep these hooks:

- `[data-lpk-section]`
- `[data-lpk-content]`
- `.lpk-poster`

Then import `src/latch.js`.
