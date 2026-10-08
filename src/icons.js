export const pageIconOptions = Object.freeze([
  Object.freeze({ value: "core", label: "Core", className: "lpk-icon lpk-icon-core" }),
  Object.freeze({ value: "pin", label: "Pin", className: "lpk-icon lpk-icon-pin" }),
  Object.freeze({ value: "spark", label: "Spark", className: "lpk-icon lpk-icon-spark" }),
  Object.freeze({ value: "grid", label: "Grid", className: "lpk-icon lpk-icon-grid" }),
  Object.freeze({ value: "media", label: "Media", className: "lpk-icon lpk-icon-media" }),
  Object.freeze({ value: "none", label: "No icon", className: "" }),
]);

export const pageIconClassByValue = new Map(
  pageIconOptions.map((option) => [option.value, option.className]),
);

export function normalizePageIcon(value) {
  const icon = String(value || "core").trim().toLowerCase();
  return pageIconClassByValue.has(icon) ? icon : "core";
}
