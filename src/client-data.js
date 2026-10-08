export function text(value) {
  return String(value || "");
}

export function list(value) {
  return Array.isArray(value) ? value : [];
}

export function cleanSlug(value, fallback = "page") {
  const slug = text(value)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function previewSrc(src, basePath = "/") {
  const value = text(src).trim();
  if (!value) return "";
  if (/^(?:data:|blob:|https?:\/\/|\/)/i.test(value)) return value;
  return `${String(basePath || "/").replace(/\/+$/, "")}/${value.replace(/^\/+/, "")}`;
}

export function pageSlugFromLocation(locationRef = window.location, fallback = "splash") {
  const parts = text(locationRef?.pathname).split("/").filter(Boolean);
  if (!parts.length || parts[0] === "admin") return fallback;
  return cleanSlug(parts[0], fallback);
}
