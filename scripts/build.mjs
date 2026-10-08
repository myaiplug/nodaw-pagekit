import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "src");
const publicRoot = path.join(root, "public");
const dist = path.join(root, "dist");
const pagesRoot = path.join(publicRoot, "pages");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(publicRoot, dist, { recursive: true });
await cp(src, path.join(dist, "kit"), { recursive: true });

const skipAdmin = process.argv.includes("--no-admin");
let pageTemplate = await readFile(path.join(src, "page.html"), "utf8");
if (skipAdmin) {
  // Production build: no editor link, no editor script, no admin bundle.
  pageTemplate = pageTemplate.replace(/<!--LPK_ADMIN-->[\s\S]*?<!--\/LPK_ADMIN-->\n?/g, "");
  await rm(path.join(dist, "kit", "admin"), { recursive: true, force: true });
  await rm(path.join(dist, "kit", "page.html"), { force: true });
}
const pages = await readPages();
if (!pages.length) {
  throw new Error("No page JSON files found in public/pages.");
}

for (const page of pages) {
  const html = renderPageHtml(pageTemplate, page);
  const pageDir = path.join(dist, page.slug);
  await mkdir(pageDir, { recursive: true });
  await writeFile(path.join(pageDir, "index.html"), html);
}

await writeFile(path.join(dist, "index.html"), renderPageHtml(pageTemplate, pages[0]));

for (const page of skipAdmin ? [] : pages) {
  const adminDir = path.join(dist, "admin", page.slug);
  await mkdir(adminDir, { recursive: true });
  await writeFile(path.join(adminDir, "index.html"), await readFile(path.join(src, "admin", "index.html"), "utf8"));
}

console.log(`Built ${pages.length} page${pages.length === 1 ? "" : "s"} to ${path.relative(root, dist)}`);

async function readPages() {
  const names = (await readdir(pagesRoot)).filter((name) => name.endsWith(".json")).sort();
  const pages = [];
  for (const name of names) {
    const slug = name.replace(/\.json$/i, "");
    const json = JSON.parse(await readFile(path.join(pagesRoot, name), "utf8"));
    pages.push({
      slug,
      title: String(json.title || slug),
      description: String(json.description || ""),
      meta: json.meta && typeof json.meta === "object" ? json.meta : {},
    });
  }
  return pages;
}

function renderPageHtml(template, page) {
  const meta = page.meta || {};
  return template
    .replaceAll("%PAGE_SLUG%", escapeHtml(page.slug))
    .replaceAll("%PAGE_TITLE%", escapeHtml(page.title))
    .replaceAll("%PAGE_DESCRIPTION%", escapeHtml(page.description))
    .replaceAll("%PAGE_ROBOTS%", escapeHtml(meta.robots || "index,follow"))
    .replaceAll("%PAGE_SITE_NAME%", escapeHtml(meta.siteName || "NoDAW Labs"))
    .replaceAll("%PAGE_OG_IMAGE_WIDTH%", escapeHtml(meta.ogImageWidth || "1200"))
    .replaceAll("%PAGE_OG_IMAGE_HEIGHT%", escapeHtml(meta.ogImageHeight || "630"))
    .replaceAll("%PAGE_OG_IMAGE_ALT%", escapeHtml(meta.ogImageAlt || page.title))
    .replaceAll("%PAGE_OG_IMAGE%", escapeHtml(meta.ogImage || ""))
    .replaceAll("%PAGE_CANONICAL%", escapeHtml(meta.canonical || ""))
    .replaceAll("%PAGE_BRAND%", escapeHtml(meta.brand || "NoDAW Labs"))
    .replaceAll("%PAGE_BRAND_HREF%", escapeHtml(meta.brandHref || "/"));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
