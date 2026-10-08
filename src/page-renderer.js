import { installLatchedMediaScroll } from "./latch.js";
import { list, pageSlugFromLocation, previewSrc, text } from "./client-data.js";
import { normalizePageIcon, pageIconClassByValue } from "./icons.js";

const richInlinePattern = /(==([^=]+)==|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;

function appendRichInline(target, value) {
  const source = text(value).replace(/\s*\n+\s*/g, " ");
  let lastIndex = 0;
  for (const match of source.matchAll(richInlinePattern)) {
    if (match.index > lastIndex) {
      target.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
    }
    const node = document.createElement(match[2] ? "mark" : match[3] ? "strong" : "em");
    node.textContent = match[2] || match[3] || match[4] || "";
    target.appendChild(node);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    target.appendChild(document.createTextNode(source.slice(lastIndex)));
  }
}

function richBlocks(value) {
  return text(value)
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function createRichText(value) {
  const root = document.createElement("div");
  root.className = "lpk-body";
  for (const block of richBlocks(value)) {
    let lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const heading = /^(#{2,4})\s+(.+)$/.exec(lines[0] || "");
    if (heading) {
      const level = heading[1].length >= 4 ? "h4" : "h3";
      const title = document.createElement(level);
      appendRichInline(title, heading[2]);
      root.appendChild(title);
      lines = lines.slice(1);
      if (!lines.length) continue;
    }
    if (lines.length && lines.every((line) => /^-\s+/.test(line))) {
      const listNode = document.createElement("ul");
      for (const line of lines) {
        const item = document.createElement("li");
        appendRichInline(item, line.replace(/^-\s+/, ""));
        listNode.appendChild(item);
      }
      root.appendChild(listNode);
      continue;
    }
    const paragraph = document.createElement("p");
    appendRichInline(paragraph, lines.join(" "));
    root.appendChild(paragraph);
  }
  return root;
}

function renderIcon(target, value) {
  const className = pageIconClassByValue.get(normalizePageIcon(value));
  if (!className) return;
  const icon = document.createElement("span");
  icon.className = className;
  icon.setAttribute("aria-hidden", "true");
  target.appendChild(icon);
}

function renderBullet(bullet, assetBasePath) {
  if (bullet?.type === "image") {
    const src = previewSrc(bullet.src, assetBasePath);
    if (!src) return null;
    const image = document.createElement("img");
    image.className = "lpk-bullet-image";
    image.src = src;
    image.alt = text(bullet.alt);
    image.loading = "lazy";
    return image;
  }
  const value = text(bullet?.text).trim();
  if (!value) return null;
  const row = document.createElement("div");
  row.className = "lpk-bullet";
  const icon = document.createElement("span");
  icon.className = "lpk-bullet-icon";
  renderIcon(icon, bullet?.icon);
  const copy = document.createElement("span");
  copy.textContent = value;
  row.append(icon, copy);
  return row;
}

function createTextPanel(section, assetBasePath) {
  const content = document.createElement("section");
  content.className = "lpk-content";
  content.dataset.lpkContent = "";

  const headline = document.createElement("h1");
  headline.className = "lpk-headline";
  headline.textContent = text(section.headline).trim();

  const lede = document.createElement("p");
  lede.className = "lpk-lede";
  appendRichInline(lede, section.lede);

  const body = createRichText(section.body);

  const bullets = document.createElement("div");
  bullets.className = "lpk-bullets";
  for (const bullet of list(section.bullets)) {
    const node = renderBullet(bullet, assetBasePath);
    if (node) bullets.appendChild(node);
  }

  // NoDAW extension: optional call-to-action links per section ({ label, href, style: "primary" | "secondary", note }).
  const actions = document.createElement("div");
  actions.className = "lpk-actions";
  for (const action of list(section.actions)) {
    const href = text(action?.href).trim();
    const label = text(action?.label).trim();
    if (!href || !label || !/^(https?:|mailto:|\/|#)/i.test(href)) continue;
    const link = document.createElement("a");
    link.className = `lpk-action is-${text(action.style) === "secondary" ? "secondary" : "primary"}`;
    link.href = href;
    link.textContent = label;
    if (/^https?:/i.test(href)) { link.rel = "noopener"; }
    actions.appendChild(link);
    const note = text(action?.note).trim();
    if (note) { const small = document.createElement("small"); small.className = "lpk-action-note"; small.textContent = note; actions.appendChild(small); }
  }

  content.append(headline, lede, body, bullets);
  if (actions.children.length) content.appendChild(actions);
  content.hidden = !(headline.textContent || lede.textContent || body.children.length || bullets.children.length || actions.children.length);
  return content;
}

function hostElement(root) {
  return root?.closest?.("[data-lpk-page]") || document.querySelector("[data-lpk-page]");
}

function chooseSectionImage(section, assetBasePath) {
  const images = list(section.images).filter((image) => previewSrc(image?.src, assetBasePath));
  if (!images.length) return null;
  if (section.randomizeImages === true) {
    return images[Math.floor(Math.random() * images.length)];
  }
  return images[0];
}

function normalizeImageFormat(value) {
  const format = text(value).trim().toLowerCase();
  return format === "square" || format === "wide" ? format : "portrait";
}

function createArtStack(section, index, assetBasePath) {
  const selectedImage = chooseSectionImage(section, assetBasePath);
  if (!selectedImage) return null;

  const art = document.createElement("section");
  art.className = "lpk-art-stack";
  art.setAttribute("aria-label", text(selectedImage.alt) || "page media");

  const frame = document.createElement("div");
  frame.className = `lpk-poster-frame is-${normalizeImageFormat(selectedImage.format)}`;

  const image = document.createElement("img");
  image.className = "lpk-poster";
  image.src = previewSrc(selectedImage.src, assetBasePath);
  image.alt = text(selectedImage.alt);
  image.decoding = "async";
  image.loading = index === 0 ? "eager" : "lazy";

  frame.appendChild(image);
  const photoCreditValue = text(section.photoCredit).trim();
  if (photoCreditValue) {
    art.classList.add("has-photo-credit");
    const photoCredit = document.createElement("p");
    photoCredit.className = "lpk-photo-credit";
    photoCredit.textContent = photoCreditValue;
    art.append(frame, photoCredit);
    return art;
  }
  art.appendChild(frame);
  return art;
}

function renderSeriesGrid(section, assetBasePath) {
  const images = list(section?.seriesGrid?.images).filter((image) => previewSrc(image?.src));
  if (!images.length) return null;
  const grid = document.createElement("div");
  grid.className = "lpk-series-grid";
  grid.style.setProperty("--lpk-series-rows", String(Math.max(1, Number(section.seriesGrid.rows) || 2)));
  for (const item of images) {
    const image = document.createElement("img");
    image.src = previewSrc(item.src, assetBasePath);
    image.alt = text(item.alt);
    image.loading = "lazy";
    grid.appendChild(image);
  }
  return grid;
}

function renderSection(section, index, options) {
  const layout = document.createElement("section");
  layout.className = "lpk-layout";
  layout.setAttribute("aria-label", text(section.headline).trim() || "page section");
  layout.dataset.lpkSection = "";

  const textPanel = createTextPanel(section, options.assetBasePath);
  const artStack = createArtStack(section, index, options.assetBasePath);
  const seriesGrid = renderSeriesGrid(section, options.assetBasePath);
  if (!artStack) layout.classList.add("has-no-image");
  layout.appendChild(textPanel);
  if (artStack) layout.appendChild(artStack);
  if (seriesGrid) layout.appendChild(seriesGrid);
  return layout;
}

export async function renderLatchedPage({
  root = document.querySelector("[data-lpk-sections]"),
  page,
  jsonUrl,
  assetBasePath = "/",
} = {}) {
  if (!root) return null;
  const host = hostElement(root);
  page = page || host?.dataset.lpkPage || pageSlugFromLocation();
  jsonUrl = jsonUrl || host?.dataset.lpkJson;
  assetBasePath = host?.dataset.lpkAssetBase || assetBasePath;
  const url = jsonUrl || `/pages/${page}.json`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load page JSON: ${url}`);
  }
  const data = await response.json();
  const sections = list(data?.sections);
  root.innerHTML = "";
  for (let index = 0; index < sections.length; index += 1) {
    root.appendChild(renderSection(sections[index], index, { assetBasePath }));
  }
  if (data?.title) document.title = text(data.title);
  window.dispatchEvent(new CustomEvent("latched-page:sections-rendered", { detail: { page, data } }));
  return data;
}

const autoRoot = document.querySelector("[data-lpk-sections]");
if (autoRoot) {
  renderLatchedPage({ root: autoRoot })
    .then(() => installLatchedMediaScroll())
    .catch((error) => {
      autoRoot.textContent = error?.message || String(error);
      autoRoot.classList.add("lpk-load-error");
    });
}
