import { cleanSlug, previewSrc, text } from "../client-data.js";
import {
  normalizePageIcon,
  pageIconClassByValue,
  pageIconOptions,
} from "../icons.js";

const jpegQuality = 0.82;
const bulletImageSize = 576;
const sectionImageSizes = Object.freeze({
  portrait: Object.freeze({ width: 1080, height: 1920 }),
  square: Object.freeze({ width: 1080, height: 1080 }),
  wide: Object.freeze({ width: 1600, height: 1000 }),
});
const seriesDefaultRows = 2;
const seriesMinRows = 1;
const seriesMaxRows = 6;

const adminRoot = document.querySelector("[data-lpk-admin]") || document.body;
const pageSlug = cleanSlug(
  adminRoot.dataset.lpkPage || location.pathname.split("/").filter(Boolean)[1] || "splash",
  "splash",
);
const adminDataUrl = adminRoot.dataset.lpkAdminData || `/admin/${pageSlug}/data`;
const staticJsonUrl = adminRoot.dataset.lpkJson || `/pages/${pageSlug}.json`;
const previewPath = adminRoot.dataset.lpkPreviewPath || `/${pageSlug}/`;
const saveLabel = adminRoot.dataset.lpkSaveLabel || `public/pages/${pageSlug}.json`;

const state = {
  page: {
    version: 1,
    title: pageSlug,
    description: "",
    sections: [],
  },
  localSaveAvailable: false,
  dirty: false,
  assetsToDelete: new Set(),
};

const els = {
  status: document.getElementById("lpk-status"),
  sections: document.getElementById("lpk-sections"),
  addSection: document.getElementById("lpk-add-section"),
  save: document.getElementById("lpk-save"),
  title: document.getElementById("lpk-page-title"),
  description: document.getElementById("lpk-page-description"),
  pageName: document.querySelector("[data-admin-page-name]"),
  previewLink: document.querySelector("[data-preview-link]"),
  sectionTemplate: document.getElementById("lpk-section-template"),
  bulletTemplate: document.getElementById("lpk-bullet-template"),
  sectionImageTemplate: document.getElementById("lpk-section-image-template"),
  seriesImageTemplate: document.getElementById("lpk-series-image-template"),
};

function setStatus(message) {
  if (els.status) els.status.textContent = message;
}

function clampInteger(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function createId(prefix = "section") {
  const id = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${cleanSlug(id).slice(0, 48)}`;
}

function normalizeAssetPath(value, requiredPrefix = "assets/") {
  const normalized = text(value)
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  return !requiredPrefix || normalized.startsWith(requiredPrefix) ? normalized : "";
}

function rememberDeletedAsset(value) {
  const assetPath = normalizeAssetPath(value);
  if (assetPath) state.assetsToDelete.add(assetPath);
}

function outputTypeForFile(file, { preservePng = false } = {}) {
  const isPng = preservePng && (
    text(file?.type).toLowerCase() === "image/png" ||
    /\.png$/i.test(text(file?.name))
  );
  return isPng ? "image/png" : "image/jpeg";
}

function themeColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    }, { once: true });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    }, { once: true });
    image.src = url;
  });
}

async function canvasDataUrlFromFile(file, {
  preservePng = false,
  width = 0,
  height = 0,
  fit = "cover",
  fillStyle = "",
} = {}) {
  const image = await loadImage(file);
  const outputType = outputTypeForFile(file, { preservePng });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: outputType === "image/png" });
  if (!context) throw new Error("Canvas unavailable.");

  canvas.width = Math.max(1, Math.round(width || image.naturalWidth));
  canvas.height = Math.max(1, Math.round(height || image.naturalHeight));
  if (outputType !== "image/png" && fillStyle) {
    context.fillStyle = fillStyle;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const scale = fit === "contain"
    ? Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
    : Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);

  return outputType === "image/png"
    ? canvas.toDataURL(outputType)
    : canvas.toDataURL(outputType, jpegQuality);
}

function normalizeImageFormat(value) {
  const format = text(value).trim().toLowerCase();
  return Object.hasOwn(sectionImageSizes, format) ? format : "portrait";
}

function normalizeBullet(bullet = {}) {
  if (bullet.type === "image") {
    return {
      type: "image",
      src: text(bullet.src),
      alt: text(bullet.alt),
      asset: bullet.asset || null,
    };
  }
  return {
    type: "text",
    text: text(bullet.text),
    icon: normalizePageIcon(bullet.icon),
  };
}

function normalizeImage(image = {}) {
  return {
    src: text(image.src),
    alt: text(image.alt),
    format: normalizeImageFormat(image.format),
    asset: image.asset || null,
  };
}

function normalizeSeriesImage(image = {}) {
  return {
    src: text(image.src),
    alt: text(image.alt),
    asset: image.asset || null,
  };
}

function normalizeSeriesGrid(seriesGrid = null) {
  if (!seriesGrid || typeof seriesGrid !== "object") return null;
  return {
    rows: clampInteger(seriesGrid.rows, seriesMinRows, seriesMaxRows, seriesDefaultRows),
    images: Array.isArray(seriesGrid.images) ? seriesGrid.images.map(normalizeSeriesImage) : [],
  };
}

function normalizeSection(section = {}, index = 0) {
  return {
    id: cleanSlug(section.id || createId(`section-${index + 1}`), `section-${index + 1}`),
    photoCredit: text(section.photoCredit),
    headline: text(section.headline),
    lede: text(section.lede),
    body: text(section.body),
    images: Array.isArray(section.images) ? section.images.map(normalizeImage) : [],
    bullets: Array.isArray(section.bullets) ? section.bullets.map(normalizeBullet) : [],
    seriesGrid: normalizeSeriesGrid(section.seriesGrid),
    // NoDAW extension: preserved (edit in JSON for now).
    actions: Array.isArray(section.actions) ? section.actions.map((a) => ({ label: text(a?.label), href: text(a?.href), style: text(a?.style), note: text(a?.note) })) : [],
  };
}

function normalizePage(input = {}) {
  return {
    version: 1,
    title: text(input.title || pageSlug),
    description: text(input.description),
    meta: input.meta && typeof input.meta === "object" ? input.meta : undefined,
    sections: (Array.isArray(input.sections) ? input.sections : []).map(normalizeSection),
  };
}

function sectionTitle(section, index) {
  return `${String(index + 1).padStart(2, "0")} ${section.headline || "Untitled section"}`;
}

function markDirty(message) {
  state.dirty = true;
  setStatus(message || (state.localSaveAvailable
    ? "Unsaved changes. Press Save to write files."
    : "Unsaved changes. Save is available only from npm run dev."));
}

function populateIconSelect(select, selectedIcon) {
  select.innerHTML = "";
  for (const icon of pageIconOptions) {
    const option = document.createElement("option");
    option.value = icon.value;
    option.textContent = icon.label;
    select.appendChild(option);
  }
  select.value = normalizePageIcon(selectedIcon);
}

function setIconPreview(container, value) {
  const icon = normalizePageIcon(value);
  container.innerHTML = "";
  container.dataset.icon = icon;
  const className = pageIconClassByValue.get(icon);
  if (!className) return;
  const marker = document.createElement("span");
  marker.className = className;
  marker.setAttribute("aria-hidden", "true");
  container.appendChild(marker);
}

function renderBullet(section, bullet, bulletIndex) {
  const fragment = els.bulletTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".lpk-subcard");
  const type = fragment.querySelector(".lpk-bullet-type");
  const textInput = fragment.querySelector(".lpk-bullet-text");
  const icon = fragment.querySelector(".lpk-bullet-icon");
  const iconPreview = fragment.querySelector(".lpk-icon-preview");
  const image = fragment.querySelector(".lpk-bullet-image-preview");
  const file = fragment.querySelector(".lpk-bullet-file");
  const alt = fragment.querySelector(".lpk-bullet-alt");
  const remove = fragment.querySelector(".lpk-remove-bullet");

  card.dataset.type = bullet.type === "image" ? "image" : "text";
  type.value = card.dataset.type;
  textInput.value = bullet.text || "";
  populateIconSelect(icon, bullet.icon);
  setIconPreview(iconPreview, bullet.icon);
  alt.value = bullet.alt || "";
  image.src = previewSrc(bullet.asset?.dataUrl || bullet.src || "");

  type.addEventListener("change", () => {
    section.bullets[bulletIndex] = type.value === "image"
      ? { type: "image", src: "", alt: "" }
      : { type: "text", text: "", icon: "core" };
    markDirty();
    render();
  });
  textInput.addEventListener("input", () => {
    bullet.text = textInput.value;
    markDirty();
  });
  icon.addEventListener("change", () => {
    bullet.icon = normalizePageIcon(icon.value);
    setIconPreview(iconPreview, bullet.icon);
    markDirty();
  });
  alt.addEventListener("input", () => {
    bullet.alt = alt.value;
    markDirty();
  });
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    setStatus("Preparing 576x576 bullet image...");
    const dataUrl = await canvasDataUrlFromFile(selected, {
      preservePng: true,
      width: bulletImageSize,
      height: bulletImageSize,
      fillStyle: themeColor("--lpk-ink", "#101010"),
    });
    rememberDeletedAsset(bullet.src);
    section.bullets[bulletIndex] = {
      type: "image",
      src: bullet.src || "",
      alt: bullet.alt || "",
      asset: {
        fileName: selected.name,
        mimeType: outputTypeForFile(selected, { preservePng: true }),
        dataUrl,
      },
    };
    markDirty("Bullet image ready. Press Save to write files.");
    render();
  });
  remove.addEventListener("click", () => {
    if (bullet.type === "image") rememberDeletedAsset(bullet.src);
    section.bullets.splice(bulletIndex, 1);
    markDirty();
    render();
  });

  return fragment;
}

function renderSectionImage(section, image, imageIndex) {
  const fragment = els.sectionImageTemplate.content.cloneNode(true);
  const title = fragment.querySelector(".lpk-section-image-title");
  const previewFrame = fragment.querySelector(".lpk-section-image-preview-frame");
  const preview = fragment.querySelector(".lpk-section-image-preview");
  const format = fragment.querySelector(".lpk-section-image-format");
  const file = fragment.querySelector(".lpk-section-image-file");
  const alt = fragment.querySelector(".lpk-section-image-alt");
  const remove = fragment.querySelector(".lpk-remove-section-image");
  const moveUp = fragment.querySelector(".lpk-section-image-up");
  const moveDown = fragment.querySelector(".lpk-section-image-down");
  const images = section.images || [];
  const currentFormat = normalizeImageFormat(image.format);
  const src = previewSrc(image.asset?.dataUrl || image.src || "");

  title.textContent = `Image ${String(imageIndex + 1).padStart(2, "0")}`;
  format.value = currentFormat;
  alt.value = image.alt || "";
  preview.src = src;
  preview.hidden = !src;
  previewFrame.dataset.format = currentFormat;
  moveUp.disabled = imageIndex <= 0;
  moveDown.disabled = imageIndex >= images.length - 1;

  format.addEventListener("change", () => {
    image.format = normalizeImageFormat(format.value);
    previewFrame.dataset.format = image.format;
    markDirty();
  });
  alt.addEventListener("input", () => {
    image.alt = alt.value;
    markDirty();
  });
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    const selectedFormat = normalizeImageFormat(format.value);
    const size = sectionImageSizes[selectedFormat];
    setStatus(`Preparing ${size.width}x${size.height} ${selectedFormat} image...`);
    const dataUrl = await canvasDataUrlFromFile(selected, {
      ...size,
      preservePng: true,
      fillStyle: themeColor("--lpk-ink", "#101010"),
    });
    rememberDeletedAsset(image.src);
    images[imageIndex] = {
      src: image.src || "",
      alt: alt.value || image.alt || "",
      format: selectedFormat,
      asset: {
        fileName: selected.name,
        mimeType: outputTypeForFile(selected, { preservePng: true }),
        dataUrl,
      },
    };
    markDirty("Section image ready. Press Save to write files.");
    render();
  });
  remove.addEventListener("click", () => {
    rememberDeletedAsset(image.src);
    images.splice(imageIndex, 1);
    markDirty();
    render();
  });
  moveUp.addEventListener("click", () => {
    if (imageIndex <= 0) return;
    const [item] = images.splice(imageIndex, 1);
    images.splice(imageIndex - 1, 0, item);
    markDirty();
    render();
  });
  moveDown.addEventListener("click", () => {
    if (imageIndex >= images.length - 1) return;
    const [item] = images.splice(imageIndex, 1);
    images.splice(imageIndex + 1, 0, item);
    markDirty();
    render();
  });

  return fragment;
}

function renderSeriesImage(section, image, imageIndex) {
  const fragment = els.seriesImageTemplate.content.cloneNode(true);
  const title = fragment.querySelector(".lpk-series-image-title");
  const preview = fragment.querySelector(".lpk-series-image-preview");
  const file = fragment.querySelector(".lpk-series-image-file");
  const alt = fragment.querySelector(".lpk-series-image-alt");
  const remove = fragment.querySelector(".lpk-remove-series-image");
  const moveUp = fragment.querySelector(".lpk-series-image-up");
  const moveDown = fragment.querySelector(".lpk-series-image-down");
  const images = section.seriesGrid?.images || [];

  title.textContent = `Image ${String(imageIndex + 1).padStart(2, "0")}`;
  preview.src = previewSrc(image.asset?.dataUrl || image.src || "");
  alt.value = image.alt || "";
  moveUp.disabled = imageIndex <= 0;
  moveDown.disabled = imageIndex >= images.length - 1;

  alt.addEventListener("input", () => {
    image.alt = alt.value;
    markDirty();
  });
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    setStatus("Preparing 576x576 series image...");
    const dataUrl = await canvasDataUrlFromFile(selected, {
      preservePng: true,
      width: bulletImageSize,
      height: bulletImageSize,
      fillStyle: themeColor("--lpk-ink", "#101010"),
    });
    rememberDeletedAsset(image.src);
    images[imageIndex] = {
      src: image.src || "",
      alt: image.alt || "",
      asset: {
        fileName: selected.name,
        mimeType: outputTypeForFile(selected, { preservePng: true }),
        dataUrl,
      },
    };
    markDirty("Series image ready. Press Save to write files.");
    render();
  });
  remove.addEventListener("click", () => {
    rememberDeletedAsset(image.src);
    images.splice(imageIndex, 1);
    markDirty();
    render();
  });
  moveUp.addEventListener("click", () => {
    if (imageIndex <= 0) return;
    const [item] = images.splice(imageIndex, 1);
    images.splice(imageIndex - 1, 0, item);
    markDirty();
    render();
  });
  moveDown.addEventListener("click", () => {
    if (imageIndex >= images.length - 1) return;
    const [item] = images.splice(imageIndex, 1);
    images.splice(imageIndex + 1, 0, item);
    markDirty();
    render();
  });

  return fragment;
}

function renderSection(section, index) {
  const fragment = els.sectionTemplate.content.cloneNode(true);
  const title = fragment.querySelector(".lpk-section-title");
  const headline = fragment.querySelector(".lpk-headline-input");
  const photoCredit = fragment.querySelector(".lpk-photo-credit-input");
  const lede = fragment.querySelector(".lpk-lede-input");
  const body = fragment.querySelector(".lpk-body-input");
  const sectionImages = fragment.querySelector(".lpk-section-image-list");
  const addSectionImage = fragment.querySelector(".lpk-add-section-image");
  const bullets = fragment.querySelector(".lpk-bullet-list");
  const addBullet = fragment.querySelector(".lpk-add-bullet");
  const toggleSeries = fragment.querySelector(".lpk-toggle-series");
  const seriesEditor = fragment.querySelector(".lpk-series-editor");
  const seriesRows = fragment.querySelector(".lpk-series-rows");
  const bulkSeriesFile = fragment.querySelector(".lpk-series-bulk-file");
  const addSeriesImage = fragment.querySelector(".lpk-add-series-image");
  const seriesImages = fragment.querySelector(".lpk-series-image-list");
  const remove = fragment.querySelector(".lpk-remove-section");
  const moveUp = fragment.querySelector(".lpk-move-up");
  const moveDown = fragment.querySelector(".lpk-move-down");

  title.textContent = sectionTitle(section, index);
  headline.value = section.headline;
  photoCredit.value = section.photoCredit;
  lede.value = section.lede;
  body.value = section.body;
  seriesEditor.hidden = !section.seriesGrid;
  toggleSeries.textContent = section.seriesGrid ? "Remove series grid" : "Add series grid";
  seriesRows.value = String(section.seriesGrid?.rows || seriesDefaultRows);
  moveUp.disabled = index <= 0;
  moveDown.disabled = index >= state.page.sections.length - 1;

  headline.addEventListener("input", () => {
    section.headline = headline.value;
    markDirty();
  });
  photoCredit.addEventListener("input", () => {
    section.photoCredit = photoCredit.value;
    markDirty();
  });
  lede.addEventListener("input", () => {
    section.lede = lede.value;
    markDirty();
  });
  body.addEventListener("input", () => {
    section.body = body.value;
    markDirty();
  });
  addSectionImage.addEventListener("click", () => {
    section.images.push({ src: "", alt: "", format: "portrait" });
    markDirty();
    render();
  });
  addBullet.addEventListener("click", () => {
    section.bullets.push({ type: "text", text: "New bullet.", icon: "core" });
    markDirty();
    render();
  });
  toggleSeries.addEventListener("click", () => {
    section.seriesGrid = section.seriesGrid ? null : { rows: seriesDefaultRows, images: [] };
    markDirty();
    render();
  });
  seriesRows.addEventListener("input", () => {
    if (!section.seriesGrid) return;
    section.seriesGrid.rows = clampInteger(seriesRows.value, seriesMinRows, seriesMaxRows, seriesDefaultRows);
    markDirty();
  });
  bulkSeriesFile.addEventListener("change", async () => {
    const selected = Array.from(bulkSeriesFile.files || []);
    if (!selected.length) return;
    if (!section.seriesGrid) section.seriesGrid = { rows: seriesDefaultRows, images: [] };
    section.seriesGrid.images = [];
    for (let fileIndex = 0; fileIndex < selected.length; fileIndex += 1) {
      const file = selected[fileIndex];
      setStatus(`Preparing series image ${fileIndex + 1}/${selected.length}...`);
      const dataUrl = await canvasDataUrlFromFile(file, {
        preservePng: true,
        width: bulletImageSize,
        height: bulletImageSize,
        fillStyle: themeColor("--lpk-ink", "#101010"),
      });
      section.seriesGrid.images.push({
        src: "",
        alt: "",
        asset: {
          fileName: file.name,
          mimeType: outputTypeForFile(file, { preservePng: true }),
          dataUrl,
        },
      });
    }
    markDirty(`Imported ${selected.length} series images. Press Save to write files.`);
    render();
  });
  addSeriesImage.addEventListener("click", () => {
    if (!section.seriesGrid) section.seriesGrid = { rows: seriesDefaultRows, images: [] };
    section.seriesGrid.images.push({ src: "", alt: "" });
    markDirty();
    render();
  });
  remove.addEventListener("click", () => {
    for (const image of section.images) rememberDeletedAsset(image.src);
    for (const bullet of section.bullets) if (bullet.type === "image") rememberDeletedAsset(bullet.src);
    for (const image of section.seriesGrid?.images || []) rememberDeletedAsset(image.src);
    state.page.sections.splice(index, 1);
    markDirty();
    render();
  });
  moveUp.addEventListener("click", () => {
    if (index <= 0) return;
    const [item] = state.page.sections.splice(index, 1);
    state.page.sections.splice(index - 1, 0, item);
    markDirty();
    render();
  });
  moveDown.addEventListener("click", () => {
    if (index >= state.page.sections.length - 1) return;
    const [item] = state.page.sections.splice(index, 1);
    state.page.sections.splice(index + 1, 0, item);
    markDirty();
    render();
  });

  section.images.forEach((image, imageIndex) => {
    sectionImages.appendChild(renderSectionImage(section, image, imageIndex));
  });
  section.bullets.forEach((bullet, bulletIndex) => {
    bullets.appendChild(renderBullet(section, bullet, bulletIndex));
  });
  if (section.seriesGrid) {
    section.seriesGrid.images.forEach((image, imageIndex) => {
      seriesImages.appendChild(renderSeriesImage(section, image, imageIndex));
    });
  }
  return fragment;
}

function render() {
  els.title.value = state.page.title;
  els.description.value = state.page.description;
  els.sections.innerHTML = "";
  state.page.sections.forEach((section, index) => {
    els.sections.appendChild(renderSection(section, index));
  });
}

async function loadPage() {
  let data = null;
  try {
    const response = await fetch(adminDataUrl, { cache: "no-store" });
    if (response.ok) {
      data = await response.json();
      state.localSaveAvailable = true;
    }
  } catch (_error) {
    data = null;
  }
  if (!data) {
    const response = await fetch(staticJsonUrl, { cache: "no-store" });
    data = response.ok ? await response.json() : { title: pageSlug, sections: [] };
    state.localSaveAvailable = false;
  }
  state.page = normalizePage(data);
  state.assetsToDelete.clear();
  render();
  setStatus(state.localSaveAvailable
    ? "Loaded from npm run dev. Save writes JSON and image assets locally."
    : "Loaded static JSON. Run npm run dev to save files locally.");
}

async function savePage() {
  if (!state.localSaveAvailable) {
    throw new Error("Save is available only from the local dev server.");
  }
  setStatus("Saving page files...");
  const response = await fetch(adminDataUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...state.page,
      version: 1,
      deletedAssets: Array.from(state.assetsToDelete),
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Save failed with ${response.status}`);
  }
  state.page = normalizePage(payload);
  state.assetsToDelete.clear();
  state.dirty = false;
  render();
  setStatus(`Saved ${state.page.sections.length} sections to ${saveLabel}.`);
}

els.pageName.textContent = pageSlug;
els.previewLink.href = previewPath;
els.title.addEventListener("input", () => {
  state.page.title = els.title.value;
  markDirty();
});
els.description.addEventListener("input", () => {
  state.page.description = els.description.value;
  markDirty();
});
els.addSection.addEventListener("click", () => {
  state.page.sections.push(normalizeSection({
    id: createId("section"),
    headline: "New section",
    lede: "Add the short intro copy for this section.",
    body: "Add longer paragraphs here. Use **bold**, *emphasis*, ==highlight==, and ### subsection headings.",
    bullets: [
      { type: "text", text: "Add a bullet point.", icon: "core" },
    ],
    images: [],
  }, state.page.sections.length));
  markDirty();
  render();
});
els.save.addEventListener("click", () => {
  savePage().catch((error) => setStatus(error?.message || String(error)));
});

loadPage().catch((error) => setStatus(error?.message || String(error)));
