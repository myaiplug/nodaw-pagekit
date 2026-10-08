import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const publicRoot = path.join(root, "public");
const pagesRoot = path.join(publicRoot, "pages");
const assetRoot = path.join(publicRoot, "assets", "pages");
const port = Number(readArg("--port") || process.env.PORT || 5179);
const defaultPage = cleanSlug(readArg("--page") || process.env.LPK_PAGE || "splash", "splash");
const maxBodyBytes = 80 * 1024 * 1024;

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    response.writeHead(error?.statusCode || 500, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ error: error?.message || String(error) }));
  }
});

server.listen(port, () => {
  console.log(`pagekit dev server: http://localhost:${port}/`);
  console.log(`Admin: http://localhost:${port}/admin/${defaultPage}/`);
});

async function route(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || `localhost:${port}`}`);
  const pathname = decodeURIComponent(url.pathname);

  const adminMatch = /^\/admin\/([^/]+)\/data\/?$/.exec(pathname);
  if (adminMatch) {
    await handleAdminData(request, response, cleanSlug(adminMatch[1], defaultPage));
    return;
  }

  if (pathname === "/admin" || pathname === "/admin/") {
    redirect(response, `/admin/${defaultPage}/`);
    return;
  }

  const adminPageMatch = /^\/admin\/([^/]+)\/?$/.exec(pathname);
  if (adminPageMatch) {
    if (!pathname.endsWith("/")) {
      redirect(response, `${pathname}/`);
      return;
    }
    await sendFile(response, path.join(srcRoot, "admin", "index.html"));
    return;
  }

  if (pathname.startsWith("/kit/")) {
    await sendFile(response, safeJoin(srcRoot, pathname.slice("/kit/".length)));
    return;
  }

  if (pathname === "/") {
    await sendPage(response, defaultPage);
    return;
  }

  const pageRoute = /^\/([^/.][^/]*)\/?$/.exec(pathname);
  if (pageRoute && await pageExists(pageRoute[1])) {
    if (!pathname.endsWith("/")) {
      redirect(response, `${pathname}/`);
      return;
    }
    await sendPage(response, cleanSlug(pageRoute[1], defaultPage));
    return;
  }

  const staticPath = safeJoin(publicRoot, pathname.replace(/^\/+/, ""));
  if (existsSync(staticPath) && (await stat(staticPath)).isFile()) {
    await sendFile(response, staticPath);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

async function handleAdminData(request, response, pageSlug) {
  if (request.method === "GET" || request.method === "HEAD") {
    const file = await readPageJson(pageSlug);
    response.writeHead(200, jsonHeaders());
    response.end(request.method === "HEAD" ? "" : file);
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405, jsonHeaders({ Allow: "GET, HEAD, POST" }));
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  const input = JSON.parse((await readBody(request, maxBodyBytes)).toString("utf8"));
  const output = await normalizePageForWrite(input, pageSlug);
  const json = `${JSON.stringify(output, null, 2)}\n`;
  await mkdir(pagesRoot, { recursive: true });
  await writeFile(pageJsonPath(pageSlug), json);
  await deleteRemovedAssets(input.deletedAssets, collectAssetPaths(output));
  response.writeHead(200, jsonHeaders());
  response.end(json);
}

async function sendPage(response, pageSlug) {
  const template = await readFile(path.join(srcRoot, "page.html"), "utf8");
  const data = JSON.parse(await readPageJson(pageSlug));
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(renderPageHtml(template, {
    slug: pageSlug,
    title: data.title || pageSlug,
    description: data.description || "",
    meta: data.meta || {},
  }));
}

async function sendFile(response, filePath) {
  if (!filePath || !existsSync(filePath) || !(await stat(filePath)).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-store",
  });
  response.end(await readFile(filePath));
}

async function normalizePageForWrite(input, pageSlug) {
  const page = {
    version: 1,
    title: String(input.title || pageSlug),
    description: String(input.description || ""),
    ...(input.meta && typeof input.meta === "object" ? { meta: input.meta } : {}),
    sections: [],
  };
  const sections = Array.isArray(input.sections) ? input.sections : [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index] || {};
    const id = cleanSlug(section.id || `section-${index + 1}`, `section-${index + 1}`);
    const normalized = {
      id,
      photoCredit: String(section.photoCredit || ""),
      headline: String(section.headline || ""),
      lede: String(section.lede || ""),
      body: String(section.body || ""),
      images: [],
      bullets: [],
      actions: (Array.isArray(section.actions) ? section.actions : []).map((a) => ({ label: String(a?.label || ""), href: String(a?.href || ""), style: String(a?.style || ""), note: String(a?.note || "") })).filter((a) => a.label && a.href),
    };
    for (let imageIndex = 0; imageIndex < (Array.isArray(section.images) ? section.images : []).length; imageIndex += 1) {
      const image = section.images[imageIndex] || {};
      const imageData = decodeDataUrl(image.asset?.dataUrl, new Set(["image/jpeg", "image/png", "image/svg+xml"]));
      const normalizedImage = {
        src: normalizeAssetPath(image.src),
        alt: String(image.alt || ""),
        format: normalizeImageFormat(image.format),
      };
      if (imageData) {
        normalizedImage.src = await writePageAsset({
          pageSlug,
          prefix: `${id}-image-${String(imageIndex + 1).padStart(2, "0")}`,
          extension: extensionForMime(imageData.mimeType),
          bytes: imageData.bytes,
        });
      }
      if (normalizedImage.src) normalized.images.push(normalizedImage);
    }
    for (let bulletIndex = 0; bulletIndex < (Array.isArray(section.bullets) ? section.bullets : []).length; bulletIndex += 1) {
      const bullet = section.bullets[bulletIndex] || {};
      if (bullet.type === "image") {
        const imageData = decodeDataUrl(bullet.asset?.dataUrl, new Set(["image/jpeg", "image/png", "image/svg+xml"]));
        const imageBullet = {
          type: "image",
          src: normalizeAssetPath(bullet.src),
          alt: String(bullet.alt || ""),
        };
        if (imageData) {
          imageBullet.src = await writePageAsset({
            pageSlug,
            prefix: `${id}-bullet-${String(bulletIndex + 1).padStart(2, "0")}`,
            extension: extensionForMime(imageData.mimeType),
            bytes: imageData.bytes,
          });
        }
        if (imageBullet.src) normalized.bullets.push(imageBullet);
      } else {
        const value = String(bullet.text || "").trim();
        if (value) normalized.bullets.push({ type: "text", text: value, icon: normalizeIcon(bullet.icon) });
      }
    }
    const series = normalizeSeriesGrid(section.seriesGrid);
    if (series) {
      const images = [];
      for (let imageIndex = 0; imageIndex < series.images.length; imageIndex += 1) {
        const image = series.images[imageIndex] || {};
        const imageData = decodeDataUrl(image.asset?.dataUrl, new Set(["image/jpeg", "image/png", "image/svg+xml"]));
        const normalizedImage = {
          src: normalizeAssetPath(image.src),
          alt: String(image.alt || ""),
        };
        if (imageData) {
          normalizedImage.src = await writePageAsset({
            pageSlug,
            prefix: `${id}-series-${String(imageIndex + 1).padStart(2, "0")}`,
            extension: extensionForMime(imageData.mimeType),
            bytes: imageData.bytes,
          });
        }
        if (normalizedImage.src) images.push(normalizedImage);
      }
      if (images.length) normalized.seriesGrid = { rows: series.rows, images };
    }
    page.sections.push(normalized);
  }
  return page;
}

function normalizeSeriesGrid(seriesGrid) {
  if (!seriesGrid || typeof seriesGrid !== "object") return null;
  const images = Array.isArray(seriesGrid.images) ? seriesGrid.images : [];
  return {
    rows: clampInteger(seriesGrid.rows, 1, 6, 2),
    images,
  };
}

async function writePageAsset({ pageSlug, prefix, extension, bytes }) {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const fileName = `${cleanSlug(prefix, "asset")}-${hash}${extension}`;
  const relativePath = `assets/pages/${pageSlug}/${fileName}`;
  await mkdir(path.dirname(path.join(publicRoot, relativePath)), { recursive: true });
  await writeFile(path.join(publicRoot, relativePath), bytes);
  return relativePath;
}

async function deleteRemovedAssets(values, referencedAssets) {
  const referenced = new Set(referencedAssets);
  for (const value of Array.isArray(values) ? values : []) {
    const assetPath = normalizeAssetPath(value);
    if (!assetPath || referenced.has(assetPath)) continue;
    const filePath = path.join(publicRoot, assetPath);
    if (!filePath.startsWith(publicRoot) || !existsSync(filePath)) continue;
    await rm(filePath, { force: true });
  }
}

function collectAssetPaths(output) {
  const paths = [];
  for (const section of output.sections || []) {
    for (const image of section.images || []) if (image.src) paths.push(image.src);
    for (const bullet of section.bullets || []) if (bullet.type === "image" && bullet.src) paths.push(bullet.src);
    for (const image of section.seriesGrid?.images || []) if (image.src) paths.push(image.src);
  }
  return paths;
}

function decodeDataUrl(value, allowedMimeTypes) {
  if (!value) return null;
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(value));
  if (!match) {
    const error = new Error("Image data must be a base64 data URL");
    error.statusCode = 400;
    throw error;
  }
  const mimeType = match[1].toLowerCase();
  if (!allowedMimeTypes.has(mimeType)) {
    const error = new Error(`Unsupported image type: ${mimeType}`);
    error.statusCode = 400;
    throw error;
  }
  return { mimeType, bytes: Buffer.from(match[2], "base64") };
}

function extensionForMime(mimeType) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/svg+xml") return ".svg";
  return ".jpg";
}

function normalizeImageFormat(value) {
  const format = String(value || "").trim().toLowerCase();
  return format === "square" || format === "wide" ? format : "portrait";
}

function normalizeIcon(value) {
  const icon = String(value || "core").trim().toLowerCase();
  return new Set(["core", "pin", "spark", "grid", "media", "none"]).has(icon) ? icon : "core";
}

function normalizeAssetPath(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  return normalized.startsWith("assets/") ? normalized : "";
}

function pageJsonPath(pageSlug) {
  return path.join(pagesRoot, `${pageSlug}.json`);
}

function pageExists(pageSlug) {
  return Promise.resolve(existsSync(pageJsonPath(cleanSlug(pageSlug, defaultPage))));
}

function readPageJson(pageSlug) {
  return readFile(pageJsonPath(pageSlug), "utf8");
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

function safeJoin(base, relativePath) {
  const target = path.resolve(base, String(relativePath || "").replace(/^\/+/, ""));
  const resolvedBase = path.resolve(base);
  if (target !== resolvedBase && !target.startsWith(`${resolvedBase}${path.sep}`)) {
    const error = new Error("Invalid path");
    error.statusCode = 400;
    throw error;
  }
  return target;
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end("");
}

function jsonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra,
  };
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        const error = new Error("Admin payload is too large");
        error.statusCode = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function cleanSlug(value, fallback = "page") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function clampInteger(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".avif") return "image/avif";
  return "application/octet-stream";
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
