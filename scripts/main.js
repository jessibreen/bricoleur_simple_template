// ── DOM refs ──────────────────────────────────────────────────────────────────
const mapContainer   = document.getElementById("map-container");
const mapEl          = document.getElementById("map");
const stringLayer    = document.getElementById("string-layer");
const cardsLayer     = document.getElementById("cards-layer");
const addNoteBtn     = document.getElementById("add-note-btn");
const addMediaBtn    = document.getElementById("add-media-btn");
const annotationToolbar = document.getElementById("annotation-toolbar");
const annotationLayer = document.getElementById("annotation-layer");
const annotationCanvas = document.getElementById("annotation-canvas");
const annotationStampInput = document.getElementById("annotation-stamp");
const annotationColorInput = document.getElementById("annotation-color");
const annotationSizeInput = document.getElementById("annotation-size");
const undoAnnotationBtn = document.getElementById("undo-annotation");
const clearAnnotationsBtn = document.getElementById("clear-annotations");
const deleteAnnotationBtn = document.getElementById("delete-annotation");
const annotationFillInput = document.getElementById("annotation-fill");
const modeToggleBtn = document.getElementById("mode-toggle-btn");
const annotationInputPopover = document.getElementById("annotation-input-popover");
const annotationInputField = document.getElementById("annotation-input-field");
const annotationInputApplyBtn = document.getElementById("annotation-input-apply");
const annotationInputCancelBtn = document.getElementById("annotation-input-cancel");
const annotationInlineInput = document.getElementById("annotation-inline-input");
const exportImageBtn    = document.getElementById("export-image-btn");
const saveBtn           = document.getElementById("save-btn");
const loadBtn           = document.getElementById("load-btn");
const loadInput         = document.getElementById("load-input");
const baselayerControl  = document.getElementById("baselayer-control");
const legendControl     = document.getElementById("legend-control");

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  map: null,
  mapConfig: null,
  currentTileLayer: null,
  layerLegends: [],
  mode: "normal",       // "normal" | "pin-card"
  pendingPinCardId: null,
  pins: new Map(),      // pinId  → { id, latlng, marker, cardId }
  cards: new Map(),     // cardId → { id, kind, cardType, latlng?, screenX, screenY, el, pinId? }
  pinCounter: 0,
  cardCounter: 0,
  isViewMode: false,
  annotation: {
    ctx: null,
    isDrawing: false,
    activeTool: null,
    color: "#f24e1e",
    size: 6,
    dpr: window.devicePixelRatio || 1,
    toolsVisible: false,
    lastX: 0,
    lastY: 0,
    currentPath: null,
    data: [],
    nextId: 1,
    pendingTextLatLng: null,
    pendingTextMode: null,
    stampText: "📍",
    draggingId: null,
    selectedId: null,
    dragDx: 0,
    dragDy: 0,
    dragLastX: 0,
    dragLastY: 0,
    previewPoint: null,
    fill: true,
    draft: null,          // area (polygon) still being drawn
    editingId: null,      // text label currently being re-edited
  },
  currentBaselayerName: null,
  cleanFingerprint: null, // board contents at last load / download
  everEdited: false,
  boardView: null,        // map position saved in the loaded board
  userTouchedMap: false,
  lastAutosaveFingerprint: null,
  restorePromptOpen: false,
  autosaveFailed: false,
};

// Tools where you drag from one corner/end to the other.
const DRAG_SHAPE_TOOLS = new Set(["line", "arrow", "rect", "ellipse"]);
// Annotation types stored as a list of map points.
const POINT_LIST_TYPES = new Set(["path", "line", "arrow", "rect", "ellipse", "polygon"]);

const PALETTES = {
  "blue-5":    ["#eff3ff", "#bdd7e7", "#6baed6", "#3182bd", "#08519c"],
  "red-5":     ["#fee5d9", "#fcae91", "#fb6a4a", "#de2d26", "#a50f15"],
  "green-5":   ["#edf8e9", "#bae4b3", "#74c476", "#31a354", "#006d2c"],
  "orange-5":  ["#feedde", "#fdbe85", "#fd8d3c", "#e6550d", "#a63603"],
  "viridis-5": ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  "category-6": ["#d1495b", "#edae49", "#66a182", "#2e4057", "#8a5082", "#5b8e7d"],
};

// ── Security helpers ───────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ── On-screen load problems ───────────────────────────────────────────────────
// Shows a plain-language notice on the map when a file can't be loaded, so a
// wrong path or a typo in the config doesn't just leave the map empty.
function showLoadProblem(message) {
  // eslint-disable-next-line no-console
  console.error(message);

  let box = document.getElementById("load-problems");
  if (!box) {
    box = document.createElement("div");
    box.id = "load-problems";
    box.className = "load-problems";
    box.setAttribute("role", "alert");

    const heading = document.createElement("strong");
    heading.textContent = "Something didn't load";
    box.appendChild(heading);

    const list = document.createElement("ul");
    box.appendChild(list);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "load-problems__close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", () => box.remove());
    box.appendChild(close);

    mapContainer.appendChild(box);
  }

  const item = document.createElement("li");
  item.textContent = message.charAt(0).toUpperCase() + message.slice(1);
  box.querySelector("ul").appendChild(item);
}

// Fetches and parses a JSON file, throwing an error whose message says what
// went wrong in terms a non-programmer can act on.
async function fetchJsonFile(path, whatItIs) {
  let res;
  try {
    res = await fetch(path);
  } catch {
    throw new Error(`Couldn't reach ${whatItIs} at "${path}". Check your connection and reload.`);
  }
  if (!res.ok) {
    throw new Error(`Couldn't find ${whatItIs} at "${path}". Check the spelling of the path, including capital letters.`);
  }
  try {
    return JSON.parse(await res.text());
  } catch (error) {
    throw new Error(`${whatItIs} at "${path}" isn't valid JSON (${error.message}). Look for a missing comma, quote or bracket.`);
  }
}

// ── GeoJSON popup HTML (for data layer markers) ───────────────────────────────
function formatPopupValue(value) {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function popupFieldRows(properties = {}, popupCfg = {}) {
  const fields = asArray(popupCfg.fields);
  if (!fields.length) return "";

  const rows = [];
  for (const entry of fields) {
    const fieldName = typeof entry === "string" ? entry : entry?.field;
    if (!fieldName) continue;

    const label = typeof entry === "string"
      ? fieldName
      : (entry.label || fieldName);
    const rawValue = properties[fieldName];
    const value = formatPopupValue(rawValue);
    if (!value && !entry?.showEmpty) continue;

    rows.push(
      `<div class="popup-row"><span class="popup-key">${escapeHtml(label)}</span><span class="popup-value">${escapeHtml(value || "-")}</span></div>`
    );
  }

  if (!rows.length) return "";
  return `<div class="popup-fields">${rows.join("")}</div>`;
}

function popupHtml(properties = {}, layerCfg = {}) {
  const popupCfg = layerCfg.popup || {};
  const titleField = popupCfg.titleField || "title";
  const descriptionField = popupCfg.descriptionField || "description";
  const mediaTypeField = popupCfg.mediaTypeField || "popupType";
  const mediaUrlField = popupCfg.mediaUrlField || "mediaUrl";

  const titleValue = properties[titleField] ?? properties.title ?? "Untitled";
  const descriptionValue = properties[descriptionField] ?? properties.description ?? "";
  const popupType = properties[mediaTypeField] ?? properties.popupType ?? "text";
  const mediaUrl = properties[mediaUrlField] ?? properties.mediaUrl ?? "";

  const title = escapeHtml(formatPopupValue(titleValue) || "Untitled");
  const description = escapeHtml(formatPopupValue(descriptionValue));

  const parts = [`<h3>${title}</h3>`];
  if (description) parts.push(`<p>${description}</p>`);
  const extraRows = popupFieldRows(properties, popupCfg);
  if (extraRows) parts.push(extraRows);
  if (popupType === "image" && mediaUrl)
    parts.push(`<img class="popup-media" src="${escapeHtml(mediaUrl)}" alt="${title}" />`);
  if (popupType === "audio" && mediaUrl)
    parts.push(`<audio class="popup-media" controls><source src="${escapeHtml(mediaUrl)}" /></audio>`);
  if (popupType === "video" && mediaUrl)
    parts.push(`<video class="popup-media" controls><source src="${escapeHtml(mediaUrl)}" /></video>`);
  return parts.join("");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getFeatures(geojson) {
  return Array.isArray(geojson?.features) ? geojson.features : [];
}

function normalizePointShape(shape) {
  if (shape === "square" || shape === "diamond") return shape;
  return "circle";
}

function isPointLayer(layerCfg = {}, geojson) {
  if (layerCfg.geometryType === "point") return true;
  if (layerCfg.geometryType === "polygon") return false;

  const feature = getFeatures(geojson)[0];
  const geometryType = feature?.geometry?.type || "";
  return geometryType.includes("Point");
}

function getLegendShape(layerCfg = {}, geojson) {
  if (isPointLayer(layerCfg, geojson)) {
    return normalizePointShape(layerCfg.pointShape);
  }
  return "square";
}

function normalizeLayerType(layerCfg = {}) {
  return layerCfg.layerType || "simple";
}

function getPaletteColors(paletteName, count, fallback = []) {
  if (Array.isArray(fallback) && fallback.length >= count) return fallback.slice(0, count);
  const source = PALETTES[paletteName] || fallback || PALETTES["blue-5"];
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(source[Math.min(i, source.length - 1)]);
  }
  return colors;
}

function makeLegendBlock(title, items = []) {
  return { title, items: items.filter((item) => item && item.label) };
}

function renderLayerLegends() {
  if (!legendControl) return;
  legendControl.innerHTML = "";

  const blocks = state.layerLegends.filter((block) => block?.items?.length);
  legendControl.classList.toggle("is-visible", blocks.length > 0);
  if (!blocks.length) return;

  for (const block of blocks) {
    const section = document.createElement("section");
    section.className = "legend-block";

    const title = document.createElement("h3");
    title.className = "legend-title";
    title.textContent = block.title || "Legend";
    section.appendChild(title);

    const items = document.createElement("div");
    items.className = "legend-items";

    for (const item of block.items) {
      const row = document.createElement("div");
      row.className = "legend-item";

      const swatch = document.createElement("span");
      swatch.className = `legend-swatch${item.shape === "circle" ? " is-circle" : ""}${item.shape === "diamond" ? " is-diamond" : ""}`;
      swatch.style.background = item.color || "#d1d5db";
      row.appendChild(swatch);

      const label = document.createElement("span");
      label.textContent = item.label;
      row.appendChild(label);

      items.appendChild(row);
    }

    section.appendChild(items);
    legendControl.appendChild(section);
  }
}

function buildRangeLabels(breaks) {
  if (!breaks.length) return ["Values"];
  return breaks.map((value, index) => {
    if (index === 0) return `<= ${value}`;
    return `${breaks[index - 1]} to ${value}`;
  }).concat(`> ${breaks[breaks.length - 1]}`);
}

function getFeatureValue(feature, fieldName) {
  if (!fieldName) return null;
  return feature?.properties?.[fieldName] ?? null;
}

function getChoroplethDefinition(layerCfg = {}) {
  const breaks = asArray(layerCfg.breaks).filter((value) => Number.isFinite(Number(value))).map(Number);
  const colorCount = breaks.length + 1;
  const colors = getPaletteColors(layerCfg.palette || "blue-5", colorCount, asArray(layerCfg.colors));
  const labels = asArray(layerCfg.labels).length === colorCount
    ? layerCfg.labels
    : buildRangeLabels(breaks);

  return {
    field: layerCfg.valueField,
    breaks,
    colors,
    labels,
    nullColor: layerCfg.nullColor || "#e5e7eb",
    nullLabel: layerCfg.noDataLabel || "No data",
    legendTitle: layerCfg.legendTitle || layerCfg.name,
  };
}

function getChoroplethColor(value, definition) {
  const num = Number(value);
  if (!Number.isFinite(num)) return definition.nullColor;
  for (let i = 0; i < definition.breaks.length; i++) {
    if (num <= definition.breaks[i]) return definition.colors[i];
  }
  return definition.colors[definition.colors.length - 1];
}

function buildChoroplethLegend(layerCfg) {
  const definition = getChoroplethDefinition(layerCfg);
  const items = definition.colors.map((color, index) => ({
    color,
    label: definition.labels[index],
  }));
  items.push({ color: definition.nullColor, label: definition.nullLabel });
  return makeLegendBlock(definition.legendTitle, items);
}

function getCategoricalDefinition(layerCfg = {}, geojson) {
  const features = getFeatures(geojson);
  const configured = asArray(layerCfg.categories);
  const byValue = new Map();
  const configuredColors = getPaletteColors(
    layerCfg.palette || "category-6",
    Math.max(configured.length, 1),
    asArray(layerCfg.colors),
  );

  configured.forEach((category, index) => {
    if (category && category.value != null) {
      byValue.set(String(category.value), {
        ...category,
        color: category.color || configuredColors[index],
      });
    }
  });

  if (!configured.length && layerCfg.valueField) {
    const values = [...new Set(features
      .map((feature) => getFeatureValue(feature, layerCfg.valueField))
      .filter((value) => value != null)
      .map(String))].sort((left, right) => left.localeCompare(right));
    const colors = getPaletteColors(layerCfg.palette || "category-6", values.length, asArray(layerCfg.colors));
    values.forEach((value, index) => {
      byValue.set(value, { value, label: value, color: colors[index] });
    });
  }

  const categories = [...byValue.values()];
  return {
    field: layerCfg.valueField,
    categories,
    fallbackColor: layerCfg.nullColor || layerCfg.style?.fillColor || layerCfg.pointStyle?.fillColor || "#9ca3af",
    nullLabel: layerCfg.noDataLabel || "Other / missing",
    legendTitle: layerCfg.legendTitle || layerCfg.name,
  };
}

function getCategoryMatch(value, definition) {
  const key = value == null ? null : String(value);
  return definition.categories.find((category) => String(category.value) === key) || null;
}

function buildCategoricalLegend(layerCfg, geojson) {
  const definition = getCategoricalDefinition(layerCfg, geojson);
  const shape = getLegendShape(layerCfg, geojson);
  const items = definition.categories.map((category) => ({
    color: category.color,
    label: category.label || String(category.value),
    shape,
  }));

  if (definition.fallbackColor) {
    items.push({
      color: definition.fallbackColor,
      label: definition.nullLabel,
      shape,
    });
  }

  return makeLegendBlock(definition.legendTitle, items);
}

function buildSimpleLegend(layerCfg, geojson) {
  if (!layerCfg.showLegend) return null;
  const isPoint = isPointLayer(layerCfg, geojson);
  const shape = getLegendShape(layerCfg, geojson);
  const color = isPoint
    ? (layerCfg.pointStyle?.fillColor || layerCfg.pointStyle?.color || "#6b7280")
    : (layerCfg.style?.fillColor || layerCfg.style?.color || "#6b7280");
  return makeLegendBlock(layerCfg.legendTitle || layerCfg.name, [{
    color,
    label: layerCfg.legendLabel || layerCfg.name,
    shape,
  }]);
}

function createPointLayerMarker(latlng, style = {}, shape = "circle", renderer) {
  const radius = Number.isFinite(Number(style.radius)) ? Number(style.radius) : 7;
  const fillColor = style.fillColor || style.color || "#6b7280";
  const strokeColor = style.color || "#ffffff";
  const weight = Number.isFinite(Number(style.weight)) ? Number(style.weight) : 1;
  const fillOpacity = Number.isFinite(Number(style.fillOpacity)) ? Number(style.fillOpacity) : 0.95;

  if (shape === "circle") {
    return L.circleMarker(latlng, {
      ...style,
      radius,
      fillColor,
      color: strokeColor,
      weight,
      fillOpacity,
      renderer,
    });
  }

  const size = Math.max(8, Math.round(radius * 2));
  const icon = L.divIcon({
    className: `data-point-icon data-point-icon--${shape}`,
    html: `<span style="width:${size}px;height:${size}px;background:${fillColor};border:${weight}px solid ${strokeColor};opacity:${fillOpacity};"></span>`,
    iconSize: [size, size],
    iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
    popupAnchor: [0, -Math.round(size / 2)],
  });

  return L.marker(latlng, { icon });
}

function buildLayerLegend(layerCfg, geojson) {
  if (layerCfg.showLegend === false) return null;

  switch (normalizeLayerType(layerCfg)) {
    case "choropleth":
      return buildChoroplethLegend(layerCfg);
    case "categorical":
      return buildCategoricalLegend(layerCfg, geojson);
    default:
      return buildSimpleLegend(layerCfg, geojson);
  }
}

function createLayerRuntime(layerCfg, geojson) {
  const layerType = normalizeLayerType(layerCfg);
  const runtime = {
    layerType,
    pointShape: normalizePointShape(layerCfg.pointShape),
    legend: buildLayerLegend(layerCfg, geojson),
    style: (feature) => ({ ...(layerCfg.style || {}) }),
    pointStyle: (feature) => ({ ...(layerCfg.pointStyle || {}) }),
  };

  if (layerType === "choropleth") {
    const definition = getChoroplethDefinition(layerCfg);
    runtime.legend = buildChoroplethLegend(layerCfg);
    runtime.style = (feature) => ({
      ...(layerCfg.style || {}),
      fillColor: getChoroplethColor(getFeatureValue(feature, definition.field), definition),
    });
    return runtime;
  }

  if (layerType === "categorical") {
    const definition = getCategoricalDefinition(layerCfg, geojson);
    runtime.legend = buildCategoricalLegend(layerCfg, geojson);
    runtime.style = (feature) => {
      const match = getCategoryMatch(getFeatureValue(feature, definition.field), definition);
      return {
        ...(layerCfg.style || {}),
        fillColor: match?.color || definition.fallbackColor,
        color: (layerCfg.style || {}).color || match?.color || definition.fallbackColor,
      };
    };
    runtime.pointStyle = (feature) => {
      const match = getCategoryMatch(getFeatureValue(feature, definition.field), definition);
      return {
        ...(layerCfg.pointStyle || {}),
        fillColor: match?.color || definition.fallbackColor,
        color: (layerCfg.pointStyle || {}).color || "#ffffff",
      };
    };
  }

  return runtime;
}

// ── Pushpin icon ───────────────────────────────────────────────────────────────
// Uses a Leaflet DivIcon with an inline SVG thumbtack. The icon anchor sits at
// the very tip of the pin shaft so it geographically locates the exact point.
function makePushpinIcon(color = "#e63946") {
  const darkColor = color === "#e63946" ? "#c1121f" : color;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <!-- Pin head: round, shiny -->
      <circle cx="14" cy="13" r="12" fill="${color}" stroke="rgba(0,0,0,0.22)" stroke-width="1.5"/>
      <!-- Specular highlight -->
      <ellipse cx="10" cy="9" rx="4.5" ry="3" fill="rgba(255,255,255,0.36)" transform="rotate(-15 10 9)"/>
      <!-- Shadow inside head -->
      <circle cx="14" cy="13" r="12" fill="url(#grad-${color.replace('#','')})" stroke="none"/>
      <!-- Shaft -->
      <line x1="14" y1="25" x2="14" y2="40"
            stroke="${darkColor}" stroke-width="4" stroke-linecap="round"/>
      <line x1="14" y1="25" x2="14" y2="40"
            stroke="rgba(0,0,0,0.18)" stroke-width="2" stroke-linecap="round"/>
    </svg>`.trim();

  return L.divIcon({
    html: svg,
    className: "pushpin-icon",
    iconSize:   [28, 40],
    iconAnchor: [14, 40],   // tip of the shaft
    popupAnchor:[0, -42],
  });
}

// ── Coordinate helpers ─────────────────────────────────────────────────────────
function latLngToScreen(latlng) {
  return state.map.latLngToContainerPoint([latlng.lat, latlng.lng]);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCardZoomWindow(card) {
  const anchorZoom = Number.isFinite(card.anchorZoom) ? card.anchorZoom : state.map.getZoom();
  // Pinned cards stay open when zooming in; they tuck away only when zoomed
  // far enough out that they would crowd the map.
  return { min: anchorZoom - 2, max: Infinity };
}

function isAnchoredCardVisible(card) {
  if (card.kind !== "anchor") return true;
  if (card.forceVisible) return true;
  const zoom = state.map?.getZoom?.() ?? 0;
  const window = getCardZoomWindow(card);
  return zoom >= window.min && zoom <= window.max;
}

function pinScaleForZoom(zoom) {
  // Scale around map zoom 11, with guard rails so pins remain legible.
  return clamp(0.62 + (zoom - 11) * 0.09, 0.55, 1.6);
}

function updatePinVisuals() {
  const zoom = state.map?.getZoom?.() ?? 0;
  const scale = pinScaleForZoom(zoom);
  for (const pin of state.pins.values()) {
    const markerEl = pin.marker.getElement?.();
    if (!markerEl) continue;
    const svg = markerEl.querySelector("svg");
    if (!svg) continue;
    svg.style.transform = `scale(${scale})`;
    svg.style.transformOrigin = "50% 100%";
  }
}

function annotationLatLngToPoint(latlng) {
  return state.map.latLngToContainerPoint([latlng.lat, latlng.lng]);
}

function annotationPointToLatLng(point) {
  const ll = state.map.containerPointToLatLng([point.x, point.y]);
  return { lat: ll.lat, lng: ll.lng };
}

function resizeAnnotationCanvas() {
  const rect = mapEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const a = state.annotation;
  annotationCanvas.width = Math.max(1, Math.floor(rect.width * a.dpr));
  annotationCanvas.height = Math.max(1, Math.floor(rect.height * a.dpr));

  const ctx = annotationCanvas.getContext("2d");
  ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  a.ctx = ctx;
  renderAnnotations();
}

function clearAnnotations() {
  const { ctx, data } = state.annotation;
  if (!ctx) return;
  data.length = 0;
  state.annotation.draft = null;
  state.annotation.selectedId = null;
  state.annotation.editingId = null;
  const rect = mapEl.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  deleteAnnotationBtn.disabled = true;
}

function setAnnotationTool(tool) {
  if (state.annotation.activeTool !== tool) {
    hideAnnotationInputPopover();
    finishPolygonDraft();
    state.annotation.previewPoint = null;
  }
  state.annotation.activeTool = tool;
  document.body.classList.toggle("polygon-mode", tool === "polygon");
  for (const btn of annotationToolbar.querySelectorAll(".tool-btn")) {
    btn.classList.toggle("is-active", btn.dataset.tool === tool);
  }
  if (!tool) {
    state.annotation.selectedId = null;
    renderAnnotations();
  }
  updateAnnotationInteractivity();
}

function setToolsVisible(visible) {
  state.annotation.toolsVisible = visible;
  annotationToolbar.classList.toggle("is-hidden", !visible);
  if (!visible) {
    state.annotation.selectedId = null;
    hideAnnotationInputPopover();
    setAnnotationTool(null);
  } else {
    updateAnnotationInteractivity();
  }
}

function updateAnnotationInteractivity() {
  const { activeTool, toolsVisible } = state.annotation;
  const enabled = !state.isViewMode && toolsVisible && activeTool !== null && state.mode !== "pin-card";
  annotationLayer.classList.toggle("is-active", enabled);
  if (!enabled || activeTool === "select") {
    annotationCanvas.style.cursor = "default";
  } else {
    annotationCanvas.style.cursor = "crosshair";
  }
}

function updateAnnotationCursor(point) {
  const a = state.annotation;
  if (state.isViewMode || !a.toolsVisible) {
    annotationCanvas.style.cursor = "default";
    return;
  }

  if (a.draggingId) {
    annotationCanvas.style.cursor = "grabbing";
    return;
  }

  const tool = a.activeTool;
  if (tool === "select") {
    annotationCanvas.style.cursor = hitTestAnyAnnotation(point) ? "grab" : "default";
    return;
  }

  if ((tool === "text" || tool === "stamp") && hitTestTextOrStamp(point)) {
    annotationCanvas.style.cursor = "grab";
    return;
  }

  annotationCanvas.style.cursor = tool ? "crosshair" : "default";
}

function forwardWheelToMap(ev) {
  if (!state.map) return;
  ev.preventDefault();
  mapEl.dispatchEvent(new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: ev.clientX,
    clientY: ev.clientY,
    screenX: ev.screenX,
    screenY: ev.screenY,
    deltaX: ev.deltaX,
    deltaY: ev.deltaY,
    deltaZ: ev.deltaZ,
    deltaMode: ev.deltaMode,
    ctrlKey: ev.ctrlKey,
    shiftKey: ev.shiftKey,
    altKey: ev.altKey,
    metaKey: ev.metaKey,
  }));
}

function getCanvasPoint(ev) {
  const rect = annotationCanvas.getBoundingClientRect();
  return {
    x: ev.clientX - rect.left,
    y: ev.clientY - rect.top,
  };
}

// ── Annotation geometry helpers ───────────────────────────────────────────────
function isPointListItem(item) {
  return POINT_LIST_TYPES.has(item?.type) && Array.isArray(item.points);
}

function annotationFontSize(item) {
  return Math.max(12, item.size * (item.type === "stamp" ? 3 : 2));
}

function shapeScreenPoints(item) {
  return item.points.map(annotationLatLngToPoint);
}

function boundsOfPoints(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return distanceBetween(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0, 1);
  return distanceBetween(p, { x: a.x + t * dx, y: a.y + t * dy });
}

// ── Text labels ───────────────────────────────────────────────────────────────
function showInlineTextInput(point, fontSize, value) {
  const pad = 4;
  const width = Math.max(fontSize * 3, (value || "").length * fontSize * 0.62 + fontSize);

  annotationInlineInput.value = value || "";
  annotationInlineInput.classList.remove("is-hidden");
  annotationInlineInput.style.left = `${point.x - pad}px`;
  annotationInlineInput.style.top = `${point.y - fontSize - pad}px`;
  annotationInlineInput.style.width = `${width + pad * 2}px`;
  annotationInlineInput.style.height = `${fontSize + pad * 2}px`;
  annotationInlineInput.style.fontSize = `${fontSize}px`;
  annotationInlineInput.focus();
  annotationInlineInput.select();
}

function placeTextAnnotation(point, mode) {
  const a = state.annotation;
  a.pendingTextLatLng = annotationPointToLatLng(point);
  a.pendingTextMode = mode;
  a.editingId = null;
  a.selectedId = null;
  a.previewPoint = null;
  renderAnnotations();
  showInlineTextInput(point, Math.max(12, a.size * (mode === "stamp" ? 3 : 2)), "");
}

// Re-open an existing text label (or stamp) for editing in place.
function editTextAnnotation(item) {
  const a = state.annotation;
  a.pendingTextLatLng = { ...item.latlng };
  a.pendingTextMode = item.type;
  a.editingId = item.id;
  a.selectedId = null;
  a.draggingId = null;
  a.previewPoint = null;
  renderAnnotations();
  showInlineTextInput(annotationLatLngToPoint(item.latlng), annotationFontSize(item), item.text || "");
}

function hideAnnotationInputPopover() {
  const wasEditing = state.annotation.editingId !== null;
  annotationInputPopover.classList.add("is-hidden");
  annotationInlineInput.classList.add("is-hidden");
  state.annotation.pendingTextLatLng = null;
  state.annotation.pendingTextMode = null;
  state.annotation.editingId = null;
  if (wasEditing) renderAnnotations();
}

function isInlineTextInputOpen() {
  return !annotationInlineInput.classList.contains("is-hidden");
}

function commitAnnotationTextFromPopover() {
  const a = state.annotation;
  if (!a.ctx || !a.pendingTextLatLng || !a.pendingTextMode) return;

  // Use inline input if visible, otherwise fall back to popover input
  const textValue = isInlineTextInputOpen()
    ? annotationInlineInput.value.trim()
    : annotationInputField.value.trim();

  if (a.editingId) {
    const existing = a.data.find((item) => item.id === a.editingId);
    if (existing) {
      if (textValue) existing.text = textValue;
      else a.data = a.data.filter((item) => item !== existing);
    }
    hideAnnotationInputPopover();
    renderAnnotations();
    return;
  }

  if (!textValue) {
    hideAnnotationInputPopover();
    return;
  }

  a.data.push({
    id: `ann-${a.nextId++}`,
    type: a.pendingTextMode,
    latlng: { ...a.pendingTextLatLng },
    text: textValue,
    color: a.color,
    size: a.size,
  });
  a.selectedId = null;
  hideAnnotationInputPopover();
  renderAnnotations();
}

function placeStampAnnotation(point) {
  const a = state.annotation;
  const text = (a.stampText || "📍").trim() || "📍";
  a.data.push({
    id: `ann-${a.nextId++}`,
    type: "stamp",
    latlng: annotationPointToLatLng(point),
    text,
    color: a.color,
    size: a.size,
  });
  a.selectedId = null;
  renderAnnotations();
}

// ── Area (polygon) tool ───────────────────────────────────────────────────────
// Each click adds a corner. Double-click, Enter, or clicking the first corner
// again closes the area.
function addPolygonPoint(point) {
  const a = state.annotation;
  const latlng = annotationPointToLatLng(point);

  if (!a.draft) {
    a.draft = {
      id: `ann-${a.nextId++}`,
      type: "polygon",
      color: a.color,
      size: a.size,
      fill: a.fill,
      points: [latlng],
    };
    a.data.push(a.draft);
    a.selectedId = null;
    a.previewPoint = point;
    renderAnnotations();
    return;
  }

  const pts = shapeScreenPoints(a.draft);
  if (pts.length >= 3 && distanceBetween(point, pts[0]) <= 10) {
    finishPolygonDraft();
    return;
  }
  // Ignore the second click of a double-click landing on the same spot.
  if (distanceBetween(point, pts[pts.length - 1]) < 4) return;

  a.draft.points.push(latlng);
  renderAnnotations();
}

function finishPolygonDraft() {
  const a = state.annotation;
  if (!a.draft) return;
  const draft = a.draft;
  a.draft = null;
  a.previewPoint = null;
  // An area needs at least three corners; anything less is discarded.
  if (draft.points.length < 3) {
    a.data = a.data.filter((item) => item !== draft);
  }
  renderAnnotations();
}

function cancelPolygonDraft() {
  const a = state.annotation;
  if (!a.draft) return;
  const draft = a.draft;
  a.draft = null;
  a.previewPoint = null;
  a.data = a.data.filter((item) => item !== draft);
  renderAnnotations();
}

// ── Hit testing ───────────────────────────────────────────────────────────────
function hitTestTextOrStamp(point) {
  const a = state.annotation;
  if (!a.ctx) return null;

  for (let i = a.data.length - 1; i >= 0; i -= 1) {
    const item = a.data[i];
    if (item.type !== "text" && item.type !== "stamp") continue;
    const pt = annotationLatLngToPoint(item.latlng);
    const fontSize = annotationFontSize(item);
    a.ctx.save();
    a.ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
    const w = a.ctx.measureText(item.text || "").width;
    a.ctx.restore();
    const h = fontSize;
    const left = pt.x - 4;
    const top = pt.y - h;
    const right = pt.x + w + 4;
    const bottom = pt.y + 4;
    if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
      return { item, pt };
    }
  }
  return null;
}

function hitTestShape(point) {
  const a = state.annotation;

  for (let i = a.data.length - 1; i >= 0; i -= 1) {
    const item = a.data[i];
    if (!isPointListItem(item) || !item.points.length || item === a.draft) continue;

    const pts = shapeScreenPoints(item);
    const tolerance = Math.max(8, item.size);
    let hit = false;

    if (item.type === "path" || item.type === "line" || item.type === "arrow") {
      if (pts.length === 1) {
        hit = distanceBetween(point, pts[0]) <= tolerance;
      }
      for (let j = 1; j < pts.length && !hit; j += 1) {
        hit = distanceToSegment(point, pts[j - 1], pts[j]) <= tolerance;
      }
    } else {
      // Boxes, circles and areas: anywhere inside their outline counts.
      const b = boundsOfPoints(pts);
      hit = point.x >= b.minX - tolerance && point.x <= b.maxX + tolerance
        && point.y >= b.minY - tolerance && point.y <= b.maxY + tolerance;
    }

    if (hit) return { item, pt: point };
  }

  return null;
}

function hitTestAnyAnnotation(point) {
  return hitTestTextOrStamp(point) || hitTestShape(point);
}

function deleteSelectedAnnotation() {
  const a = state.annotation;
  if (!a.selectedId) return;
  a.data = a.data.filter((item) => item.id !== a.selectedId);
  a.selectedId = null;
  renderAnnotations();
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function drawTextPreviewBox(point, toolType, size, color) {
  const a = state.annotation;
  if (!a.ctx) return;

  const fontSize = Math.max(12, size * (toolType === "stamp" ? 3 : 2));
  const w = Math.max(40, fontSize * 3);
  const h = fontSize;
  const pad = 4;

  a.ctx.save();
  a.ctx.strokeStyle = color;
  a.ctx.lineWidth = 2;
  a.ctx.globalAlpha = 0.5;
  a.ctx.strokeRect(point.x - pad, point.y - h - pad, w + pad * 2, h + pad * 2);
  a.ctx.restore();
}

function drawSelectionBox(ctx, bounds, pad) {
  ctx.save();
  ctx.strokeStyle = "rgba(230, 57, 70, 0.95)";
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(
    bounds.minX - pad,
    bounds.minY - pad,
    (bounds.maxX - bounds.minX) + pad * 2,
    (bounds.maxY - bounds.minY) + pad * 2,
  );
  ctx.restore();
}

// Draws one line / shape annotation. `pts` are its points in screen pixels.
function drawShape(ctx, item, pts, isDraft) {
  ctx.save();
  ctx.lineWidth = item.size;
  ctx.strokeStyle = item.color;
  ctx.fillStyle = item.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const fillInside = () => {
    if (!item.fill) return;
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.restore();
  };

  switch (item.type) {
    case "path": {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      break;
    }
    case "line":
    case "arrow": {
      const start = pts[0];
      const end = pts[pts.length - 1];
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const head = item.type === "arrow" ? Math.max(12, item.size * 3) : 0;
      const length = distanceBetween(start, end);
      // Stop the shaft short of the tip so the arrowhead stays pointed.
      const shaftEnd = head && length > head
        ? { x: end.x - Math.cos(angle) * head * 0.8, y: end.y - Math.sin(angle) * head * 0.8 }
        : end;

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(shaftEnd.x, shaftEnd.y);
      ctx.stroke();

      if (head && length > 1) {
        const spread = Math.PI / 7;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - Math.cos(angle - spread) * head, end.y - Math.sin(angle - spread) * head);
        ctx.lineTo(end.x - Math.cos(angle + spread) * head, end.y - Math.sin(angle + spread) * head);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "rect": {
      const b = boundsOfPoints(pts);
      ctx.beginPath();
      ctx.rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      fillInside();
      ctx.stroke();
      break;
    }
    case "ellipse": {
      const b = boundsOfPoints(pts);
      ctx.beginPath();
      ctx.ellipse(
        (b.minX + b.maxX) / 2,
        (b.minY + b.maxY) / 2,
        Math.max(0.5, (b.maxX - b.minX) / 2),
        Math.max(0.5, (b.maxY - b.minY) / 2),
        0, 0, Math.PI * 2,
      );
      fillInside();
      ctx.stroke();
      break;
    }
    case "polygon": {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      if (isDraft) {
        // Still being drawn: rubber-band to the pointer and mark the corners.
        const preview = state.annotation.previewPoint;
        if (preview) ctx.lineTo(preview.x, preview.y);
        ctx.stroke();
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(4, item.size * 0.75), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.closePath();
        fillInside();
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

function renderAnnotations() {
  const a = state.annotation;
  if (!a.ctx) return;
  const rect = mapEl.getBoundingClientRect();
  a.ctx.clearRect(0, 0, rect.width, rect.height);

  for (const item of a.data) {
    if (isPointListItem(item)) {
      if (!item.points.length) continue;
      const pts = shapeScreenPoints(item);
      drawShape(a.ctx, item, pts, item === a.draft);
      if (item.id === a.selectedId) {
        drawSelectionBox(a.ctx, boundsOfPoints(pts), Math.max(6, item.size));
      }
      continue;
    }

    if (item.type === "text" || item.type === "stamp") {
      if (item.id === a.editingId) continue; // shown in the text box instead
      const p = annotationLatLngToPoint(item.latlng);
      const fontSize = annotationFontSize(item);
      a.ctx.save();
      a.ctx.fillStyle = item.color;
      a.ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
      a.ctx.fillText(item.text || "", p.x, p.y);

      if (item.id === a.selectedId) {
        const w = a.ctx.measureText(item.text || "").width;
        drawSelectionBox(
          a.ctx,
          { minX: p.x, minY: p.y - fontSize, maxX: p.x + w, maxY: p.y },
          4,
        );
      }

      a.ctx.restore();
    }
  }

  // Draw text preview box only for text tool while hovering
  if (a.activeTool === "text" && a.previewPoint && !a.draggingId && !isInlineTextInputOpen()) {
    drawTextPreviewBox(a.previewPoint, a.activeTool, a.size, a.color);
  }

  deleteAnnotationBtn.disabled = !a.selectedId;
}

function serializeAnnotations() {
  return JSON.parse(JSON.stringify(state.annotation.data));
}

function restoreAnnotations(data) {
  clearAnnotations();
  if (!data) return;

  if (Array.isArray(data)) {
    state.annotation.data = JSON.parse(JSON.stringify(data));
    let maxId = 0;
    for (const item of data) {
      const idNum = Number(String(item.id || "").replace("ann-", ""));
      if (Number.isFinite(idNum)) maxId = Math.max(maxId, idNum);
    }
    state.annotation.nextId = maxId + 1;
    renderAnnotations();
    return;
  }

  // Backward compatibility for older board files that stored a raster dataURL.
  if (typeof data === "string") {
    const image = new Image();
    image.onload = () => {
      const rect = mapEl.getBoundingClientRect();
      state.annotation.ctx?.drawImage(image, 0, 0, rect.width, rect.height);
    };
    image.src = data;
  }
}

// ── String drawing ─────────────────────────────────────────────────────────────
// Redraws all strings (bezier curves) between each pin and its linked card.
// Called on every map move/zoom and every card drag.
function redrawStrings() {
  stringLayer.innerHTML = "";

  const mapRect = mapEl.getBoundingClientRect();

  for (const [, pin] of state.pins) {
    const card = state.cards.get(pin.cardId);
    if (!card) continue;
    if (card.kind === "anchor" && !isAnchoredCardVisible(card)) continue;

    const pinPt = latLngToScreen(pin.latlng);

    // Card attach point: top-centre of the card element.
    const cardRect = card.el.getBoundingClientRect();
    const cardPt = {
      x: cardRect.left - mapRect.left + cardRect.width / 2,
      y: cardRect.top  - mapRect.top,
    };

    // Cubic bezier: slight natural droop
    const dx = cardPt.x - pinPt.x;
    const dy = cardPt.y - pinPt.y;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d",
      `M ${pinPt.x} ${pinPt.y} ` +
      `C ${pinPt.x + dx * 0.2} ${pinPt.y + dy * 0.05}, ` +
      `  ${pinPt.x + dx * 0.8} ${pinPt.y + dy * 0.95}, ` +
      `  ${cardPt.x} ${cardPt.y}`
    );
    path.setAttribute("class", "string-path");
    stringLayer.appendChild(path);
  }
}

function resizeStringLayer() {
  const rect = mapEl.getBoundingClientRect();
  stringLayer.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  stringLayer.setAttribute("width",   String(rect.width));
  stringLayer.setAttribute("height",  String(rect.height));
  redrawStrings();
}

// ── Anchored card positioning ──────────────────────────────────────────────────
// Converts the card's stored lat/lng back to screen coordinates and repositions.
function updateAnchoredCard(card) {
  if (card.kind !== "anchor") return;
  const pt = latLngToScreen(card.latlng);
  card.el.style.left = `${pt.x}px`;
  card.el.style.top  = `${pt.y}px`;
}

function updateAllAnchored() {
  for (const card of state.cards.values()) {
    updateAnchoredCard(card);
  }
  updateAnchoredVisibility();
  redrawStrings();
  renderAnnotations();
}

function updateCardPinButton(card) {
  const pinBtn = card.el.querySelector(".card-pin-btn");
  if (!pinBtn) return;
  const pinned = card.kind === "anchor" && !!card.pinId;
  pinBtn.textContent = pinned ? "Remove Pin" : "Add Pin";
  pinBtn.classList.toggle("is-active", state.mode === "pin-card" && state.pendingPinCardId === card.id);
}

function setCardPinnedState(card, isPinned) {
  card.kind = isPinned ? "anchor" : "float";
  card.el.classList.toggle("is-anchored", isPinned);
  updateCardPinButton(card);
}

function setCardMinimized(card, minimized) {
  card.minimized = !!minimized;
  if (minimized) {
    // Save any inline height set by the CSS resize handle, then clear it so
    // the card collapses to header-only height.
    card._savedHeight = card.el.style.height || "";
    card.el.style.height = "";
  } else if (card._savedHeight !== undefined) {
    card.el.style.height = card._savedHeight;
  }
  card.el.classList.toggle("is-minimized", card.minimized);
  const minBtn = card.el.querySelector(".card-min-btn");
  if (minBtn) {
    minBtn.textContent = card.minimized ? "▸" : "▾";
    minBtn.setAttribute("aria-label", card.minimized ? "Expand card" : "Minimize card");
    minBtn.title = card.minimized ? "Expand" : "Minimize";
  }
}

function updateAnchoredVisibility() {
  for (const card of state.cards.values()) {
    if (card.kind !== "anchor") continue;
    card.el.classList.toggle("is-zoom-hidden", !isAnchoredCardVisible(card));
  }

  updatePinVisuals();
}

// ── Media player renderer ──────────────────────────────────────────────────────
function renderMediaPlayer(container, url) {
  container.innerHTML = "";
  if (!url) return;

  const clean = url.trim();

  // YouTube
  const ytMatch = clean.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/
  );
  if (ytMatch) {
    const id = ytMatch[1];
    container.innerHTML =
      `<iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(id)}" ` +
      `frameborder="0" allowfullscreen class="card-media-iframe"></iframe>`;
    return;
  }

  // Vimeo
  const vimeoMatch = clean.match(/vimeo\.com\/(?:video\/)?([0-9]+)/);
  if (vimeoMatch) {
    const id = vimeoMatch[1];
    container.innerHTML =
      `<iframe src="https://player.vimeo.com/video/${escapeHtml(id)}" ` +
      `frameborder="0" allowfullscreen class="card-media-iframe"></iframe>`;
    return;
  }

  // SoundCloud
  if (/soundcloud\.com\//.test(clean)) {
    const encoded = encodeURIComponent(clean);
    container.innerHTML =
      `<iframe src="https://w.soundcloud.com/player/?url=${encoded}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false" ` +
      `frameborder="0" class="card-media-iframe card-media-iframe--audio"></iframe>`;
    return;
  }

  // Extension-based detection (covers data: URLs and relative paths too)
  const ext = clean.split("?")[0].split(".").pop().toLowerCase();

  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext) || clean.startsWith("data:image/")) {
    container.innerHTML = `<img src="${escapeHtml(clean)}" alt="Media" />`;
  } else if (["mp4", "webm", "mov", "ogv"].includes(ext) || clean.startsWith("data:video/")) {
    container.innerHTML = `<video controls><source src="${escapeHtml(clean)}" /></video>`;
  } else if (["mp3", "wav", "ogg", "aac", "m4a", "flac"].includes(ext) || clean.startsWith("data:audio/")) {
    container.innerHTML = `<audio controls><source src="${escapeHtml(clean)}" /></audio>`;
  } else {
    container.innerHTML =
      `<a href="${escapeHtml(clean)}" target="_blank" rel="noopener noreferrer">Open media ↗</a>`;
  }
}

// ── Media import ───────────────────────────────────────────────────────────────
// Files chosen with "Browse…" are stored inside the board file itself, so they
// have to stay small: GitHub's website refuses uploads over 25 MB. Photos are
// shrunk automatically; anything else that is large must live in the repo.
const EMBED_AS_IS_BYTES = 300 * 1024;
const EMBED_LIMIT_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_EDGE = 1600;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

async function shrinkImage(file) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be opened."));
      img.src = sourceUrl;
    });
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function importMediaFile(file) {
  if (file.size <= EMBED_AS_IS_BYTES) return readFileAsDataUrl(file);

  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return shrinkImage(file);
  }

  if (file.size <= EMBED_LIMIT_BYTES) return readFileAsDataUrl(file);

  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  throw new Error(
    `This file is ${sizeMb} MB, which is too large to store inside the board. ` +
    `Upload it to the "media" folder of your repository on GitHub, then type its path in the box above, ` +
    `for example media/${file.name.replace(/\s+/g, "-")}`,
  );
}

// ── Card element builder ───────────────────────────────────────────────────────
function buildCardEl(cardId, cardType, kind, title) {
  const el = document.createElement("div");
  el.className = `card card--${cardType}${kind === "anchor" ? " is-anchored" : ""}`;
  el.dataset.cardId = cardId;

  const defaultTitle = title || (cardType === "note" ? "Note" : "Media");

  el.innerHTML = `
    <header class="card-handle">
      <input  class="card-title-input"
              type="text"
              value="${escapeHtml(defaultTitle)}"
              aria-label="Card title" />
      <span class="card-title-view" aria-hidden="true"></span>
      <span class="card-type-badge">${cardType === "note" ? "Note" : "Media"}</span>
      <button class="card-min-btn" type="button" aria-label="Minimize card" title="Minimize">▾</button>
      <button class="card-pin-btn editing-only" type="button" aria-label="Toggle map pin">Add Pin</button>
      <button class="card-delete-btn editing-only" type="button" aria-label="Remove card">×</button>
    </header>
    <div class="card-body">
      ${cardType === "note"
        ? `<textarea class="card-textarea"
                    placeholder="Write notes, observations, interpretations…"></textarea>`
        : `<div class="card-media-input-row editing-only">
             <input class="card-media-url"
                    type="text"
                    placeholder="Paste URL or use relative path e.g. media/photo.jpg" />
             <label class="card-media-file-btn" title="Choose a local file">
               <input class="card-media-file" type="file" accept="image/*,audio/*,video/*" />
               Browse…
             </label>
           </div>
           <div class="card-media-player"></div>`
      }
    </div>`;

  // Keep title-view in sync for view mode
  const titleInput = el.querySelector(".card-title-input");
  const titleView  = el.querySelector(".card-title-view");
  const syncTitle  = () => { titleView.textContent = titleInput.value; };
  syncTitle();
  titleInput.addEventListener("input", syncTitle);

  // Delete
  el.querySelector(".card-delete-btn").addEventListener("click", () => removeCard(cardId));

  // Add/remove pin for this card
  el.querySelector(".card-pin-btn").addEventListener("click", () => togglePinForCard(cardId));

  // Minimize/expand card body
  el.querySelector(".card-min-btn").addEventListener("click", () => {
    const card = state.cards.get(cardId);
    if (!card) return;
    setCardMinimized(card, !card.minimized);
    redrawStrings();
  });

  // Media URL wiring
  if (cardType === "media") {
    const urlInput  = el.querySelector(".card-media-url");
    const fileInput = el.querySelector(".card-media-file");
    const player    = el.querySelector(".card-media-player");
    const onChange  = () => renderMediaPlayer(player, urlInput.value);
    urlInput.addEventListener("change", onChange);
    urlInput.addEventListener("blur",   onChange);

    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      fileInput.value = "";
      importMediaFile(file)
        .then((dataUrl) => {
          urlInput.value = dataUrl;
          renderMediaPlayer(player, dataUrl);
        })
        .catch((error) => {
          player.innerHTML = "";
          const hint = document.createElement("p");
          hint.className = "card-media-hint";
          hint.textContent = error.message;
          player.appendChild(hint);
        });
    });
  }

  return el;
}

// ── Card lifecycle ─────────────────────────────────────────────────────────────
function createAnchorCard(pinId, latlng, cardType, options = {}) {
  const id = options.id || `card-${++state.cardCounter}`;
  if (options.id) {
    const n = parseInt(options.id.split("-")[1], 10) || 0;
    if (n > state.cardCounter) state.cardCounter = n;
  }

  const el = buildCardEl(id, cardType, "anchor", options.title);
  cardsLayer.appendChild(el);

  // Place the card offset from the pin (in screen space) then convert back to lat/lng
  // so it moves with the map correctly.
  let cardLatLng = options.latlng;
  if (!cardLatLng) {
    const pinPt = latLngToScreen(latlng);
    cardLatLng = {
      lat: state.map.containerPointToLatLng([pinPt.x + 180, pinPt.y - 60]).lat,
      lng: state.map.containerPointToLatLng([pinPt.x + 180, pinPt.y - 60]).lng,
    };
  }

  const card = {
    id,
    kind: "anchor",
    cardType,
    latlng: cardLatLng,
    el,
    pinId,
    minimized: !!options.minimized,
    anchorZoom: Number.isFinite(options.anchorZoom) ? options.anchorZoom : state.map.getZoom(),
    forceVisible: !!options.forceVisible,
  };
  state.cards.set(id, card);

  updateAnchoredCard(card);
  updateCardPinButton(card);
  setCardMinimized(card, !!options.minimized);
  wireDragCard(el, id);

  return card;
}

function createFloatingCard(cardType, options = {}) {
  const id = options.id || `card-${++state.cardCounter}`;
  if (options.id) {
    const n = parseInt(options.id.split("-")[1], 10) || 0;
    if (n > state.cardCounter) state.cardCounter = n;
  }

  const el = buildCardEl(id, cardType, "float", options.title);
  cardsLayer.appendChild(el);

  const mapRect = mapEl.getBoundingClientRect();
  // Boards store floating cards as a fraction of the map area so they land in
  // the same relative spot on any screen; older boards only have pixels.
  const x = Number.isFinite(options.xPct)
    ? options.xPct * mapRect.width
    : (options.screenX ?? (mapRect.width  / 2 - 130));
  const y = Number.isFinite(options.yPct)
    ? options.yPct * mapRect.height
    : (options.screenY ?? (mapRect.height / 2 - 80));
  el.style.left = `${x}px`;
  el.style.top  = `${y}px`;

  const card = {
    id,
    kind: "float",
    cardType,
    screenX: x,
    screenY: y,
    el,
    minimized: !!options.minimized,
    anchorZoom: null,
    forceVisible: false,
  };
  state.cards.set(id, card);

  updateCardPinButton(card);
  setCardMinimized(card, !!options.minimized);
  wireDragCard(el, id);
  keepFloatingCardOnScreen(card);

  return card;
}

// Floating cards must never sit outside the visible map area (for example
// when a board made on a wide screen is opened on a phone).
function keepFloatingCardOnScreen(card) {
  if (card.kind !== "float") return;
  const mapRect = mapEl.getBoundingClientRect();
  if (!mapRect.width || !mapRect.height) return;
  const width = card.el.offsetWidth || 260;
  const left = clamp(parseFloat(card.el.style.left) || 0, 0, Math.max(0, mapRect.width - width));
  const top = clamp(parseFloat(card.el.style.top) || 0, 0, Math.max(0, mapRect.height - 44));
  card.el.style.left = `${left}px`;
  card.el.style.top = `${top}px`;
  card.screenX = left;
  card.screenY = top;
}

function removeCard(cardId) {
  const card = state.cards.get(cardId);
  if (!card) return;

  card.el._resizeObserver?.disconnect?.();
  card.el.remove();
  state.cards.delete(cardId);

  // Remove linked pin if present
  if (card.pinId && state.pins.has(card.pinId)) {
    const pin = state.pins.get(card.pinId);
    pin.marker.remove();
    state.pins.delete(card.pinId);
  } else {
    // Backward compatibility for older in-memory states
    for (const [pinId, pin] of state.pins) {
      if (pin.cardId === cardId) {
        pin.marker.remove();
        state.pins.delete(pinId);
        break;
      }
    }
  }

  if (state.pendingPinCardId === cardId) exitDropPinMode();
  updateAnchoredVisibility();
  redrawStrings();
}

// ── Card dragging ──────────────────────────────────────────────────────────────
function wireDragCard(el, cardId) {
  const handle = el.querySelector(".card-handle");
  let active = false, ox = 0, oy = 0, startLeft = 0, startTop = 0;

  // Keep connector strings aligned as card dimensions change.
  const resizeObserver = new ResizeObserver(() => {
    redrawStrings();
  });
  resizeObserver.observe(el);
  el._resizeObserver = resizeObserver;

  handle.addEventListener("pointerdown", (ev) => {
    if (state.isViewMode) return;
    if (["INPUT", "BUTTON", "TEXTAREA"].includes(ev.target.tagName)) return;
    active    = true;
    ox        = ev.clientX;
    oy        = ev.clientY;
    startLeft = parseFloat(el.style.left) || 0;
    startTop  = parseFloat(el.style.top)  || 0;
    handle.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });

  handle.addEventListener("pointermove", (ev) => {
    if (!active) return;
    el.style.left = `${startLeft + ev.clientX - ox}px`;
    el.style.top  = `${startTop  + ev.clientY - oy}px`;
    redrawStrings();
  });

  handle.addEventListener("pointerup", () => {
    if (!active) return;
    active = false;

    const card    = state.cards.get(cardId);
    if (!card) return;

    const newLeft = parseFloat(el.style.left) || 0;
    const newTop  = parseFloat(el.style.top)  || 0;

    if (card.kind === "anchor") {
      // Convert the card's new top-left screen position back to lat/lng
      // so it stays glued to the map on future pan/zoom.
      card.latlng = {
        lat: state.map.containerPointToLatLng([newLeft, newTop]).lat,
        lng: state.map.containerPointToLatLng([newLeft, newTop]).lng,
      };
    } else {
      card.screenX = newLeft;
      card.screenY = newTop;
    }
  });
}

// ── Pin lifecycle ──────────────────────────────────────────────────────────────
function createPin(latlng, cardId, options = {}) {
  const id = options.id || `pin-${++state.pinCounter}`;
  if (options.id) {
    const n = parseInt(options.id.split("-")[1], 10) || 0;
    if (n > state.pinCounter) state.pinCounter = n;
  }

  const marker = L.marker([latlng.lat, latlng.lng], {
    icon:         makePushpinIcon(),
    draggable:    !state.isViewMode,
    zIndexOffset: 1000,
  }).addTo(state.map);

  const pin = { id, latlng: { lat: latlng.lat, lng: latlng.lng }, marker, cardId };
  state.pins.set(id, pin);

  // Dragging the pin updates its stored latlng and redraws the string
  marker.on("drag", () => {
    const ll = marker.getLatLng();
    pin.latlng = { lat: ll.lat, lng: ll.lng };
    redrawStrings();
  });

  marker.on("click", () => {
    const card = state.cards.get(pin.cardId);
    if (!card) return;
    card.forceVisible = true;
    card.el.classList.remove("is-zoom-hidden");
    redrawStrings();
  });

  return pin;
}

// ── Drop-pin mode ──────────────────────────────────────────────────────────────
function enterDropPinMode(cardId) {
  state.mode = "pin-card";
  state.pendingPinCardId = cardId;
  document.body.classList.add("drop-pin-mode");
  updateAnnotationInteractivity();
  for (const card of state.cards.values()) updateCardPinButton(card);
}

function exitDropPinMode() {
  state.mode = "normal";
  state.pendingPinCardId = null;
  document.body.classList.remove("drop-pin-mode");
  updateAnnotationInteractivity();
  for (const card of state.cards.values()) updateCardPinButton(card);
}

function togglePinForCard(cardId) {
  if (state.isViewMode) return;
  const card = state.cards.get(cardId);
  if (!card) return;

  if (card.kind === "anchor" && card.pinId && state.pins.has(card.pinId)) {
    // Unpin: remove marker and keep the card as a floating card in place.
    const pin = state.pins.get(card.pinId);
    pin.marker.remove();
    state.pins.delete(card.pinId);

    const x = parseFloat(card.el.style.left) || 0;
    const y = parseFloat(card.el.style.top) || 0;
    card.screenX = x;
    card.screenY = y;
    delete card.latlng;
    card.pinId = null;
    card.anchorZoom = null;
    card.forceVisible = false;
    setCardPinnedState(card, false);
    updateAnchoredVisibility();
    redrawStrings();
    return;
  }

  if (state.pendingPinCardId === cardId && state.mode === "pin-card") {
    exitDropPinMode();
    return;
  }

  enterDropPinMode(cardId);
}

// ── View mode ───────────────────────────────────────────────────────────────────
function setViewMode(enabled) {
  state.isViewMode = enabled;
  if (!enabled) state.everEdited = true;
  document.body.classList.toggle("view-mode", enabled);

  // The same button switches between looking at the map and editing it.
  modeToggleBtn.textContent = enabled ? "Edit" : "Preview";
  modeToggleBtn.title = enabled
    ? "Open the editing tools. Changes stay in this browser until you download and publish them."
    : "See the map the way visitors will";
  // Visitors don't get an Edit button unless the map's owner turns it on with
  // "showEditButton": true. Anyone who opened the editor (?mode=edit) keeps the
  // button so they can get back from Preview.
  modeToggleBtn.hidden = enabled && !state.everEdited && state.mapConfig?.showEditButton !== true;

  setToolsVisible(!enabled);

  if (enabled) {
    exitDropPinMode();
    for (const pin of state.pins.values()) {
      pin.marker.dragging?.disable();
    }
    showViewHint();
  } else {
    for (const pin of state.pins.values()) {
      pin.marker.dragging?.enable();
    }
  }

  updateAnchoredVisibility();
  for (const card of state.cards.values()) updateCardPinButton(card);
  updateAnnotationInteractivity();
}

function showViewHint() {
  const hint = document.getElementById("view-hint");
  if (!hint) return;
  hint.classList.add("is-visible");
  const dismiss = () => hint.classList.remove("is-visible");
  hint.addEventListener("click", dismiss, { once: true });
  setTimeout(dismiss, 8000);
}

// ── Serialization ──────────────────────────────────────────────────────────────
function serializeBoard() {
  const center = state.map.getCenter();

  const pinsArr = [];
  for (const pin of state.pins.values()) {
    pinsArr.push({ id: pin.id, latlng: pin.latlng, cardId: pin.cardId });
  }

  const cardsArr = [];
  for (const card of state.cards.values()) {
    const el    = card.el;
    const entry = {
      id:       card.id,
      kind:     card.kind,
      cardType: card.cardType,
      title:    el.querySelector(".card-title-input")?.value || "",
      minimized: !!card.minimized,
      pinId:    card.pinId || null,
    };

    if (card.kind === "float") {
      const mapRect = mapEl.getBoundingClientRect();
      entry.screenX = parseFloat(el.style.left) || 0;
      entry.screenY = parseFloat(el.style.top)  || 0;
      if (mapRect.width && mapRect.height) {
        entry.xPct = Number((entry.screenX / mapRect.width).toFixed(4));
        entry.yPct = Number((entry.screenY / mapRect.height).toFixed(4));
      }
    }
    if (card.kind === "anchor") entry.latlng = card.latlng;
    if (card.kind === "anchor") {
      entry.anchorZoom = Number.isFinite(card.anchorZoom) ? card.anchorZoom : state.map.getZoom();
      entry.forceVisible = !!card.forceVisible;
    }
    if (card.cardType === "note") {
      entry.text = el.querySelector(".card-textarea")?.value || "";
    } else {
      entry.mediaUrl = el.querySelector(".card-media-url")?.value || "";
    }

    cardsArr.push(entry);
  }

  return {
    schemaVersion: 1,
    generatedAt:   new Date().toISOString(),
    map: {
      center: { lat: center.lat, lng: center.lng },
      zoom: state.map.getZoom(),
      // The visible area and screen size, so a smaller screen can zoom out
      // just enough to show everything the author had in view.
      bounds: [
        [state.map.getBounds().getSouth(), state.map.getBounds().getWest()],
        [state.map.getBounds().getNorth(), state.map.getBounds().getEast()],
      ],
      size: [state.map.getSize().x, state.map.getSize().y],
    },
    basemap: state.currentBaselayerName,
    pins:  pinsArr,
    cards: cardsArr,
    annotations: serializeAnnotations(),
  };
}

// Download filenames follow the map title set in data/map-config.json.
function fileSlug() {
  const slug = String(state.mapConfig?.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "map";
}

// ── Unsaved-work protection ────────────────────────────────────────────────────
// A "fingerprint" is the board's content without the things that change just
// by looking around (map position, background), so panning never counts as an
// edit.
function fingerprintOf(board) {
  const copy = { ...board };
  delete copy.generatedAt;
  delete copy.map;
  delete copy.basemap;
  return JSON.stringify(copy);
}

function markBoardClean() {
  state.cleanFingerprint = fingerprintOf(serializeBoard());
}

function hasUnsavedChanges() {
  if (!state.map || !state.everEdited || state.cleanFingerprint === null) return false;
  return fingerprintOf(serializeBoard()) !== state.cleanFingerprint;
}

const AUTOSAVE_KEY = `bricoleur-autosave:${window.location.pathname}`;
const AUTOSAVE_EVERY_MS = 4000;

function clearAutosave() {
  try { window.localStorage.removeItem(AUTOSAVE_KEY); } catch { /* storage unavailable */ }
}

function readAutosave() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(AUTOSAVE_KEY) || "null");
    return saved?.board ? saved : null;
  } catch {
    return null;
  }
}

// Keeps a backup copy in this browser while editing, so a closed tab or a
// crash doesn't lose the session.
function autosaveTick() {
  if (state.isViewMode || state.restorePromptOpen || !state.map) return;
  const board = serializeBoard();
  const fingerprint = fingerprintOf(board);

  if (fingerprint === state.cleanFingerprint) {
    if (state.lastAutosaveFingerprint) clearAutosave();
    state.lastAutosaveFingerprint = null;
    return;
  }
  if (fingerprint === state.lastAutosaveFingerprint) return;

  try {
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), board }));
    state.lastAutosaveFingerprint = fingerprint;
  } catch {
    // Usually the browser's storage limit, hit by photos stored in the board.
    if (!state.autosaveFailed) {
      state.autosaveFailed = true;
      showPrompt(
        "This board is too large to back up in this browser. Use Download JSON often so you don't lose work.",
        [{ label: "OK" }],
      );
    }
  }
}

// Small message bar with buttons, shown over the bottom of the map.
function showPrompt(message, actions = []) {
  const bar = document.createElement("div");
  bar.className = "prompt-bar";
  bar.setAttribute("role", "alertdialog");

  const text = document.createElement("span");
  text.textContent = message;
  bar.appendChild(text);

  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    if (action.primary) btn.classList.add("is-active");
    btn.addEventListener("click", () => {
      bar.remove();
      action.onClick?.();
    });
    bar.appendChild(btn);
  }

  mapContainer.appendChild(bar);
  return bar;
}

// If this browser holds work that was never downloaded, offer it back.
function offerAutosaveRestore() {
  if (state.isViewMode || state.restorePromptOpen) return;
  const saved = readAutosave();
  if (!saved) return;
  if (fingerprintOf(saved.board) === fingerprintOf(serializeBoard())) return;

  const when = new Date(saved.savedAt);
  const whenText = Number.isNaN(when.getTime())
    ? "an earlier session"
    : when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

  state.restorePromptOpen = true;
  showPrompt(`This browser has unsaved work from ${whenText}.`, [
    {
      label: "Restore it",
      primary: true,
      onClick: async () => {
        await applyBoard(saved.board);
        state.restorePromptOpen = false;
      },
    },
    {
      label: "Discard",
      onClick: () => {
        clearAutosave();
        state.restorePromptOpen = false;
      },
    },
  ]);
}

function downloadJson() {
  const data = serializeBoard();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  markBoardClean();
  clearAutosave();
  state.lastAutosaveFingerprint = null;
  if (blob.size > 20 * 1024 * 1024) {
    const sizeMb = (blob.size / (1024 * 1024)).toFixed(0);
    window.alert(
      `This board file is ${sizeMb} MB. GitHub's website only accepts uploads up to 25 MB.\n\n` +
      "To make it smaller, upload large photos, audio or video to the \"media\" folder of your repository " +
      "and type their path into the media note instead of using Browse.",
    );
  }
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `${fileSlug()}-board.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function waitForVisibleTiles(timeoutMs = 2500) {
  const tiles = Array.from(mapContainer.querySelectorAll(".leaflet-tile"));
  const pending = tiles.filter((img) => !img.complete);
  if (pending.length === 0) return;

  await Promise.race([
    Promise.all(
      pending.map((img) => new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      }))
    ),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function downloadImage() {
  if (!window.html2canvas) {
    window.alert("Export image is unavailable right now. Please reload and try again.");
    return;
  }

  const hadInlineInput = !annotationInlineInput.classList.contains("is-hidden");
  const hadPopover = !annotationInputPopover.classList.contains("is-hidden");
  annotationInlineInput.classList.add("is-hidden");
  annotationInputPopover.classList.add("is-hidden");
  document.body.classList.add("is-exporting");

  try {
    state.map?.stop?.();
    state.map?.invalidateSize?.({ pan: false, animate: false });
    await waitForVisibleTiles();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = await window.html2canvas(mapContainer, {
      useCORS: true,
      backgroundColor: "#ffffff",
      scale: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
      logging: false,
      onclone: (doc) => {
        // Match viewer-style output by hiding edit-only controls in exported image.
        doc.querySelectorAll(".editing-only").forEach((el) => {
          el.style.display = "none";
        });

        // Cross-origin iframes (YouTube/Vimeo/SoundCloud) cannot be rasterized by html2canvas.
        // Replace them with a clear placeholder so exports don't show an empty media area.
        doc.querySelectorAll(".card-media-player iframe").forEach((iframe) => {
          const fallback = doc.createElement("div");
          fallback.className = "card-media-export-fallback";
          fallback.textContent = "Embedded media is not capturable in export. Use direct file URL for exportable media.";
          iframe.replaceWith(fallback);
        });
      },
    });

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${fileSlug()}-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  } catch (error) {
    window.alert("Could not export image. If map tiles are blocked by CORS, try again after panning/zooming.");
    // eslint-disable-next-line no-console
    console.error("Image export error:", error);
  } finally {
    document.body.classList.remove("is-exporting");
    if (hadInlineInput) annotationInlineInput.classList.remove("is-hidden");
    if (hadPopover) annotationInputPopover.classList.remove("is-hidden");
  }
}

// ── Board restore ──────────────────────────────────────────────────────────────
function clearBoard() {
  exitDropPinMode();
  setToolsVisible(!state.isViewMode);
  for (const pin  of state.pins.values())  pin.marker.remove();
  for (const card of state.cards.values()) card.el.remove();
  state.pins.clear();
  state.cards.clear();
  state.pinCounter  = 0;
  state.cardCounter = 0;
  clearAnnotations();
  updateAnchoredVisibility();
  redrawStrings();
}

function restoreCardContent(card, data) {
  const el         = card.el;
  const titleInput = el.querySelector(".card-title-input");
  const titleView  = el.querySelector(".card-title-view");

  if (titleInput) {
    titleInput.value = data.title || "";
    if (titleView) titleView.textContent = data.title || "";
  }

  if (data.cardType === "note") {
    const ta = el.querySelector(".card-textarea");
    if (ta) ta.value = data.text || "";
  } else {
    const urlInput = el.querySelector(".card-media-url");
    const player   = el.querySelector(".card-media-player");
    if (urlInput && data.mediaUrl) {
      urlInput.value = data.mediaUrl;
      if (player) renderMediaPlayer(player, data.mediaUrl);
    }
  }
}

// Positions the map the way the board's author left it. On a screen smaller
// than the author's, zoom out just enough to show everything they had in view.
function applyBoardView() {
  const view = state.boardView;
  if (!view || !state.map) return;

  state.map.invalidateSize({ animate: false });
  const here = state.map.getSize();
  const [authoredW, authoredH] = Array.isArray(view.size) ? view.size : [];
  const smallerScreen = Array.isArray(view.bounds)
    && Number.isFinite(authoredW) && Number.isFinite(authoredH)
    && (here.x < authoredW * 0.9 || here.y < authoredH * 0.9);

  if (smallerScreen) {
    state.map.fitBounds(view.bounds, { animate: false });
  } else {
    state.map.setView([view.center.lat, view.center.lng], view.zoom, { animate: false });
  }
}

async function applyBoard(data) {
  clearBoard();

  if (data.basemap) {
    const baselayers = state.mapConfig?.map?.baselayers || [];
    const idx = baselayers.findIndex((bl) => bl.name === data.basemap);
    if (idx >= 0) {
      setBaselayer(baselayers[idx]);
      updateBaselayerMenu(idx);
    }
  }

  state.boardView = data.map || null;
  state.userTouchedMap = false;
  applyBoardView();

  // On a phone, open notes collapsed so the map itself is visible first.
  const collapseAll = state.isViewMode && state.map.getSize().x < 700;
  const startMinimized = (cd) => collapseAll || cd.minimized;

  // Create floating cards first (no geo dependency)
  for (const cd of data.cards || []) {
    if (cd.kind !== "float") continue;
    const card = createFloatingCard(cd.cardType, {
      id: cd.id, title: cd.title, screenX: cd.screenX, screenY: cd.screenY,
      xPct: cd.xPct, yPct: cd.yPct, minimized: startMinimized(cd),
    });
    restoreCardContent(card, cd);
  }

  // Create anchored cards
  for (const cd of data.cards || []) {
    if (cd.kind !== "anchor") continue;
    const card = createAnchorCard(cd.pinId, cd.latlng, cd.cardType, {
      id: cd.id,
      title: cd.title,
      latlng: cd.latlng,
      minimized: startMinimized(cd),
      anchorZoom: cd.anchorZoom,
      forceVisible: cd.forceVisible,
    });
    card.pinId = cd.pinId;
    restoreCardContent(card, cd);
  }

  // Create pins and link them
  for (const pd of data.pins || []) {
    const pin = createPin(pd.latlng, pd.cardId, { id: pd.id });
    const card = state.cards.get(pd.cardId);
    if (card) {
      card.pinId = pin.id;
      setCardPinnedState(card, true);
    }
  }

  restoreAnnotations(data.annotations || null);
  updateAnchoredVisibility();
  requestAnimationFrame(() => {
    updateAllAnchored();
    for (const card of state.cards.values()) keepFloatingCardOnScreen(card);
  });
}

async function loadBoardFromUrl(boardPath) {
  await applyBoard(await fetchJsonFile(boardPath, "the board"));
  markBoardClean();
}

function sortLayersForRender(layers = [], mapConfig = {}) {
  const orderList = Array.isArray(mapConfig.layerOrder) ? mapConfig.layerOrder : [];
  const nameOrder = new Map(orderList.map((name, idx) => [String(name), idx]));

  return layers
    .map((layer, idx) => ({ layer, idx }))
    .sort((left, right) => {
      const leftDraw = Number.isFinite(Number(left.layer.drawOrder)) ? Number(left.layer.drawOrder) : null;
      const rightDraw = Number.isFinite(Number(right.layer.drawOrder)) ? Number(right.layer.drawOrder) : null;

      if (leftDraw !== null || rightDraw !== null) {
        if (leftDraw === null) return 1;
        if (rightDraw === null) return -1;
        if (leftDraw !== rightDraw) return leftDraw - rightDraw;
      }

      const leftNameOrder = nameOrder.has(left.layer.name) ? nameOrder.get(left.layer.name) : null;
      const rightNameOrder = nameOrder.has(right.layer.name) ? nameOrder.get(right.layer.name) : null;

      if (leftNameOrder !== null || rightNameOrder !== null) {
        if (leftNameOrder === null) return 1;
        if (rightNameOrder === null) return -1;
        if (leftNameOrder !== rightNameOrder) return leftNameOrder - rightNameOrder;
      }

      return left.idx - right.idx;
    })
    .map((entry) => entry.layer);
}

function shouldEnablePopup(layerCfg = {}, mapConfig = {}) {
  if (typeof layerCfg.popup?.enabled === "boolean") {
    return layerCfg.popup.enabled;
  }

  const popupLayer = mapConfig.popupLayer;
  if (typeof popupLayer === "string" && popupLayer.trim()) {
    return layerCfg.name === popupLayer;
  }

  return true;
}

// ── Data layer loading ─────────────────────────────────────────────────────────
async function loadDataLayers(layers, mapConfig = {}) {
  state.layerLegends = [];
  // One canvas shared by every layer: with a canvas per layer, the topmost
  // canvas swallows clicks and popups on the layers beneath never open.
  const renderer = L.canvas({ padding: 0.5 });
  for (const layerCfg of layers) {
    const layerLabel = `the layer "${layerCfg.name || "(no name)"}"`;
    try {
      if (!layerCfg.file) {
        showLoadProblem(`${layerLabel} has no "file" setting in data/map-config.json.`);
        continue;
      }
      const geojson = await fetchJsonFile(layerCfg.file, layerLabel);
      if (!getFeatures(geojson).length) {
        showLoadProblem(`${layerLabel} at "${layerCfg.file}" loaded but has no features to draw. It needs to be a GeoJSON FeatureCollection.`);
        continue;
      }
      const runtime = createLayerRuntime(layerCfg, geojson);
      const popupsEnabled = shouldEnablePopup(layerCfg, mapConfig);

      if (runtime.legend) state.layerLegends.push(runtime.legend);

      L.geoJSON(geojson, {
        renderer,
        style:        runtime.style,
        pointToLayer: (feature, latlng) =>
          createPointLayerMarker(latlng, runtime.pointStyle(feature), runtime.pointShape, renderer),
        onEachFeature: (feature, layer) => {
          if (popupsEnabled) {
            layer.bindPopup(popupHtml(feature.properties, layerCfg));
          }
        },
      }).addTo(state.map);
    } catch (error) {
      showLoadProblem(error.message);
    }
  }
  renderLayerLegends();
}

// ── Event wiring ───────────────────────────────────────────────────────────────
function wireEvents() {
  // ── Annotation controls ────────────────────────────────────────────────────
  annotationColorInput.addEventListener("input", (ev) => {
    state.annotation.color = ev.target.value;
  });

  annotationSizeInput.addEventListener("input", (ev) => {
    state.annotation.size = Number(ev.target.value) || 6;
    // Redraw to update text preview box
    if (state.annotation.activeTool === "text" || state.annotation.activeTool === "stamp") {
      renderAnnotations();
    }
  });

  annotationStampInput.addEventListener("input", (ev) => {
    state.annotation.stampText = ev.target.value;
  });

  undoAnnotationBtn.addEventListener("click", () => {
    if (!annotationInlineInput.classList.contains("is-hidden")) {
      hideAnnotationInputPopover();
      state.annotation.previewPoint = null;
      renderAnnotations();
      return;
    }
    if (state.annotation.draft) {
      // Step back one corner of the area being drawn.
      state.annotation.draft.points.pop();
      if (!state.annotation.draft.points.length) cancelPolygonDraft();
      else renderAnnotations();
      return;
    }
    if (state.annotation.data.length > 0) {
      state.annotation.data.pop();
      state.annotation.selectedId = null;
      renderAnnotations();
    }
  });

  for (const btn of annotationToolbar.querySelectorAll(".tool-btn")) {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool;
      if (state.annotation.activeTool === tool) {
        setAnnotationTool(null);
      } else {
        setAnnotationTool(tool);
      }
    });
  }

  clearAnnotationsBtn.addEventListener("click", () => {
    if (!state.annotation.data.length) return;
    if (window.confirm("Remove all drawings, labels and stamps from the map? Notes and pins are kept.")) {
      clearAnnotations();
    }
  });

  annotationFillInput.addEventListener("change", (ev) => {
    state.annotation.fill = ev.target.checked;
  });

  deleteAnnotationBtn.addEventListener("click", deleteSelectedAnnotation);

  const beginAnnotationDrag = (hit, point, ev) => {
    const a = state.annotation;
    a.selectedId = hit.item.id;
    a.draggingId = hit.item.id;
    a.dragDx = point.x - hit.pt.x;
    a.dragDy = point.y - hit.pt.y;
    a.dragLastX = point.x;
    a.dragLastY = point.y;
    annotationCanvas.setPointerCapture(ev.pointerId);
  };

  annotationCanvas.addEventListener("pointerdown", (ev) => {
    const a = state.annotation;
    if (state.isViewMode || !a.toolsVisible) return;

    // Clicking away from an open text box keeps what was typed.
    if (isInlineTextInputOpen()) {
      commitAnnotationTextFromPopover();
      ev.preventDefault();
      return;
    }

    const tool = a.activeTool;
    if (!tool) return;
    const point = getCanvasPoint(ev);

    if (tool === "select") {
      const hit = hitTestAnyAnnotation(point);
      a.selectedId = null;
      if (hit) beginAnnotationDrag(hit, point, ev);
      renderAnnotations();
      updateAnnotationCursor(point);
      ev.preventDefault();
      return;
    }

    if (tool === "draw" || DRAG_SHAPE_TOOLS.has(tool)) {
      const latlng = annotationPointToLatLng(point);
      a.selectedId = null;
      a.isDrawing = true;
      a.currentPath = {
        id: `ann-${a.nextId++}`,
        type: tool === "draw" ? "path" : tool,
        color: a.color,
        size: a.size,
        points: tool === "draw" ? [latlng] : [latlng, { ...latlng }],
      };
      if (tool === "rect" || tool === "ellipse") a.currentPath.fill = a.fill;
      a.data.push(a.currentPath);
      renderAnnotations();
      annotationCanvas.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }

    if (tool === "polygon") {
      addPolygonPoint(point);
      ev.preventDefault();
      return;
    }

    if (tool === "text" || tool === "stamp") {
      const hit = hitTestTextOrStamp(point);
      if (hit) {
        beginAnnotationDrag(hit, point, ev);
        renderAnnotations();
      } else {
        a.selectedId = null;
        if (tool === "text") {
          renderAnnotations();
          placeTextAnnotation(point, tool);
        } else {
          placeStampAnnotation(point);
        }
      }
      ev.preventDefault();
    }
  });

  // Double-click: finish an area, or re-open a text label for editing.
  annotationCanvas.addEventListener("dblclick", (ev) => {
    const a = state.annotation;
    if (state.isViewMode || !a.toolsVisible) return;

    if (a.draft) {
      finishPolygonDraft();
      ev.preventDefault();
      return;
    }

    if (a.activeTool === "select" || a.activeTool === "text") {
      const hit = hitTestTextOrStamp(getCanvasPoint(ev));
      if (hit) {
        editTextAnnotation(hit.item);
        ev.preventDefault();
      }
    }
  });

  annotationInputApplyBtn.addEventListener("click", () => {
    commitAnnotationTextFromPopover();
  });

  annotationInputCancelBtn.addEventListener("click", () => {
    hideAnnotationInputPopover();
  });

  annotationInputField.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      commitAnnotationTextFromPopover();
      ev.preventDefault();
    } else if (ev.key === "Escape") {
      hideAnnotationInputPopover();
      ev.preventDefault();
    }
  });

  annotationInlineInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      commitAnnotationTextFromPopover();
      ev.preventDefault();
    } else if (ev.key === "Escape") {
      hideAnnotationInputPopover();
      ev.preventDefault();
      ev.stopPropagation();
    }
  });

  annotationCanvas.addEventListener("wheel", forwardWheelToMap, { passive: false });
  annotationInputPopover.addEventListener("wheel", forwardWheelToMap, { passive: false });

  annotationCanvas.addEventListener("pointermove", (ev) => {
    const a = state.annotation;
    const point = getCanvasPoint(ev);
    updateAnnotationCursor(point);

    if (a.draggingId) {
      const item = a.data.find((d) => d.id === a.draggingId);
      if (item) {
        if (item.type === "text" || item.type === "stamp") {
          item.latlng = annotationPointToLatLng({ x: point.x - a.dragDx, y: point.y - a.dragDy });
        } else if (isPointListItem(item)) {
          const dx = point.x - a.dragLastX;
          const dy = point.y - a.dragLastY;
          item.points = item.points.map((p) => {
            const screenPoint = annotationLatLngToPoint(p);
            return annotationPointToLatLng({ x: screenPoint.x + dx, y: screenPoint.y + dy });
          });
          a.dragLastX = point.x;
          a.dragLastY = point.y;
        }
        renderAnnotations();
      }
      ev.preventDefault();
      return;
    }

    if (a.isDrawing && a.currentPath) {
      const latlng = annotationPointToLatLng(point);
      if (a.currentPath.type === "path") a.currentPath.points.push(latlng);
      else a.currentPath.points[1] = latlng;
      renderAnnotations();
      ev.preventDefault();
      return;
    }

    // Hover previews: the text box outline, or the next edge of an area.
    if (a.toolsVisible && (a.activeTool === "text" || a.draft)) {
      a.previewPoint = point;
      renderAnnotations();
      return;
    }

    if (a.previewPoint) {
      a.previewPoint = null;
      renderAnnotations();
    }
  });

  const stopDrawing = () => {
    const a = state.annotation;
    const shape = a.currentPath;
    // A click without a drag leaves a zero-size shape; drop it.
    if (a.isDrawing && shape && shape.type !== "path") {
      const pts = shapeScreenPoints(shape);
      if (distanceBetween(pts[0], pts[1]) < 4) {
        a.data = a.data.filter((item) => item !== shape);
      }
    }
    a.isDrawing = false;
    a.currentPath = null;
    a.draggingId = null;
    renderAnnotations();
  };
  annotationCanvas.addEventListener("pointerup", stopDrawing);
  annotationCanvas.addEventListener("pointercancel", stopDrawing);


  // ── Map click: place pin for the selected card ─────────────────────────────
  state.map.on("click", (ev) => {
    if (state.isViewMode || state.mode !== "pin-card") return;

    const card = state.cards.get(state.pendingPinCardId);
    if (!card) {
      exitDropPinMode();
      return;
    }

    const latlng = { lat: ev.latlng.lat, lng: ev.latlng.lng };

    // Remove any prior pin first so a card has at most one linked marker.
    if (card.pinId && state.pins.has(card.pinId)) {
      const oldPin = state.pins.get(card.pinId);
      oldPin.marker.remove();
      state.pins.delete(card.pinId);
    }

    const pin = createPin(latlng, card.id);
    card.pinId = pin.id;

    // Preserve exactly where the user placed the card before pinning.
    const cardX = parseFloat(card.el.style.left) || 0;
    const cardY = parseFloat(card.el.style.top) || 0;
    card.latlng = {
      lat: state.map.containerPointToLatLng([cardX, cardY]).lat,
      lng: state.map.containerPointToLatLng([cardX, cardY]).lng,
    };
    delete card.screenX;
    delete card.screenY;
    card.anchorZoom = state.map.getZoom();
    card.forceVisible = false;
    setCardPinnedState(card, true);

    updateAnchoredCard(card);
    updateAnchoredVisibility();
    redrawStrings();
    exitDropPinMode();
  });

  // ── Map move / zoom: reposition anchored cards + redraw strings ────────────
  state.map.on("move zoom moveend", updateAllAnchored);

  // ── Header buttons ─────────────────────────────────────────────────────────
  addNoteBtn.addEventListener("click",  () => {
    exitDropPinMode();
    const card = createFloatingCard("note");
    card.el.querySelector(".card-textarea")?.focus();
  });

  addMediaBtn.addEventListener("click", () => {
    exitDropPinMode();
    const card = createFloatingCard("media");
    card.el.querySelector(".card-media-url")?.focus();
  });

  exportImageBtn.addEventListener("click", downloadImage);

  saveBtn.addEventListener("click", downloadJson);

  loadBtn.addEventListener("click", () => {
    if (!state.isViewMode) loadInput.click();
  });

  loadInput.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      await applyBoard(JSON.parse(await file.text()));
      markBoardClean();
    } catch (error) {
      window.alert("Could not read board file. Please check the file format.");
      // eslint-disable-next-line no-console
      console.error(error);
    } finally {
      loadInput.value = "";
    }
  });

  // ── Esc cancels drop-pin mode ──────────────────────────────────────────────
  document.addEventListener("keydown", (ev) => {
    // Keys typed into a note, title or text box belong to that box.
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(ev.target?.tagName);

    if (!typing && ev.key === "Enter" && state.annotation.draft) {
      finishPolygonDraft();
      ev.preventDefault();
      return;
    }

    if (!typing && (ev.key === "Delete" || ev.key === "Backspace") && state.annotation.toolsVisible && !state.isViewMode) {
      if (state.annotation.selectedId) ev.preventDefault();
      deleteSelectedAnnotation();
      return;
    }

    if (ev.key === "Escape") {
      cancelPolygonDraft();
      hideAnnotationInputPopover();
      exitDropPinMode();
      setAnnotationTool(null);
    }
  });

  // ── Keep string SVG sized to the map container ────────────────────────────
  new ResizeObserver(() => {
    // The map area changes size when the toolbar appears, wraps or hides;
    // Leaflet only notices window resizes on its own.
    state.map.invalidateSize({ animate: false });
    // Until the visitor moves the map themselves, keep showing the author's
    // view (covers a phone being rotated, or a slow first layout).
    if (!state.userTouchedMap && state.isViewMode) {
      applyBoardView();
      if (state.map.getSize().x < 700) {
        for (const card of state.cards.values()) {
          if (!card.minimized) setCardMinimized(card, true);
        }
      }
    }
    resizeStringLayer();
    resizeAnnotationCanvas();
    for (const card of state.cards.values()) keepFloatingCardOnScreen(card);
  }).observe(mapEl);

  for (const type of ["pointerdown", "wheel", "keydown"]) {
    mapContainer.addEventListener(type, () => { state.userTouchedMap = true; }, { capture: true, passive: true });
  }

  // ── Switch between viewing and editing ─────────────────────────────────────
  modeToggleBtn.addEventListener("click", () => {
    const toView = !state.isViewMode;
    setViewMode(toView);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", toView ? "view" : "edit");
    window.history.replaceState(null, "", url);
    if (!toView) offerAutosaveRestore();
  });

  // ── Don't lose work ────────────────────────────────────────────────────────
  window.setInterval(autosaveTick, AUTOSAVE_EVERY_MS);
  window.addEventListener("beforeunload", (ev) => {
    if (!hasUnsavedChanges()) return;
    autosaveTick();
    ev.preventDefault();
    ev.returnValue = "";
  });
}

// ── Baselayer management ────────────────────────────────────────────────────────
function setBaselayer(baselayerConfig) {
  if (!baselayerConfig || !state.map) return;

  // Remove the current tile layer if it exists
  if (state.currentTileLayer) {
    state.map.removeLayer(state.currentTileLayer);
  }

  // Add the new tile layer and store it
  state.currentBaselayerName = baselayerConfig.name || null;
  state.currentTileLayer = L.tileLayer(baselayerConfig.url, {
    attribution: baselayerConfig.attribution,
    maxZoom: 20,
    crossOrigin: true,
  }).addTo(state.map);
}

function updateBaselayerMenu(activeIdx) {
  if (!baselayerControl) return;
  for (const btn of baselayerControl.querySelectorAll("button")) {
    const idx = parseInt(btn.dataset.index, 10);
    btn.classList.toggle("is-active", idx === activeIdx);
  }
}

// ── Init ────────────────────────────────────────────────────────────────────────
async function init() {
  state.mapConfig = await fetchJsonFile("data/map-config.json", "the map settings file");

  const mc = state.mapConfig.map;

  const title = String(state.mapConfig.title || "").trim();
  if (title) {
    document.title = title;
    const heading = document.querySelector(".header-brand h1");
    if (heading) heading.textContent = title;
  }

  state.map = L.map("map", {
    center: mc.center,
    zoom: mc.zoom,
    zoomControl: true,
    zoomSnap: 0.25, // lets a board fit a smaller screen without overshooting
    scrollWheelZoom: true,
    touchZoom: true,
  });

  setBaselayer(mc.baselayer);

  // Populate on-map baselayer control with pill buttons
  if (mc.baselayers && baselayerControl) {
    for (let i = 0; i < mc.baselayers.length; i++) {
      const bl = mc.baselayers[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = bl.name;
      btn.dataset.index = i;
      btn.addEventListener("click", () => {
        setBaselayer(state.mapConfig.map.baselayers[i]);
        updateBaselayerMenu(i);
      });
      baselayerControl.appendChild(btn);
    }
    const initialIdx = mc.baselayers.findIndex((bl) => bl.url === mc.baselayer.url) || 0;
    updateBaselayerMenu(initialIdx);
  }

  state.annotation.color = annotationColorInput.value;
  state.annotation.size = Number(annotationSizeInput.value) || 6;
  state.annotation.stampText = annotationStampInput.value;
  resizeAnnotationCanvas();
  updateAnnotationInteractivity();

  const orderedLayers = sortLayersForRender(state.mapConfig.layers || [], mc || {});
  await loadDataLayers(orderedLayers, mc || {});

  wireEvents();
  resizeStringLayer();

  // Which board to open: one named in the link, otherwise the published
  // board set as "defaultBoard" in data/map-config.json.
  const params    = new URLSearchParams(window.location.search);
  const modeParam = params.get("mode");
  const boardPath = params.get("board") || String(state.mapConfig.defaultBoard || "").trim();

  // With a board to show, visitors see it read-only; "?mode=edit" (or the
  // Edit button) opens the tools. With no board yet, start in the editor.
  setViewMode(modeParam === "view" || (modeParam !== "edit" && !!boardPath));

  if (boardPath) {
    try {
      await loadBoardFromUrl(boardPath);
    } catch (error) {
      showLoadProblem(error.message);
    }
  }

  markBoardClean();
  offerAutosaveRestore();
}

init().catch((error) => showLoadProblem(error.message));
