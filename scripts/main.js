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
  },
};

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
  return { min: anchorZoom - 1, max: anchorZoom + 1 };
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
  const rect = mapEl.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
}

function setAnnotationTool(tool) {
  if (state.annotation.activeTool !== tool) {
    hideAnnotationInputPopover();
    state.annotation.previewPoint = null;
  }
  state.annotation.activeTool = tool;
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
  if (!enabled) {
    annotationCanvas.style.cursor = "default";
  } else if (activeTool === "draw") {
    annotationCanvas.style.cursor = "crosshair";
  }
}

function getStrokeWidth(mode, size) {
  return size;
}

function updateAnnotationCursor(point) {
  if (state.isViewMode || !state.annotation.toolsVisible) {
    annotationCanvas.style.cursor = "default";
    return;
  }

  if (state.annotation.draggingId) {
    annotationCanvas.style.cursor = "grabbing";
    return;
  }

  const hit = hitTestAnyAnnotation(point);
  if (hit) {
    annotationCanvas.style.cursor = "grab";
    return;
  }

  if (state.annotation.activeTool === "draw" || state.annotation.activeTool === "text" || state.annotation.activeTool === "stamp") {
    annotationCanvas.style.cursor = "crosshair";
    return;
  }

  annotationCanvas.style.cursor = "default";
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

function drawStrokeSegment(x1, y1, x2, y2, mode, color, size) {
  const a = state.annotation;
  if (!a.ctx) return;
  a.ctx.save();
  a.ctx.lineWidth = getStrokeWidth(mode, size);
  a.ctx.strokeStyle = color;
  a.ctx.beginPath();
  a.ctx.moveTo(x1, y1);
  a.ctx.lineTo(x2, y2);
  a.ctx.stroke();
  a.ctx.restore();
}

function placeTextAnnotation(point, mode) {
  const a = state.annotation;
  a.pendingTextLatLng = annotationPointToLatLng(point);
  a.pendingTextMode = mode;
  a.selectedId = null;
  a.previewPoint = null;
  renderAnnotations();

  // Show inline input at preview location
  annotationInlineInput.value = "";
  annotationInlineInput.classList.remove("is-hidden");
  
  const fontSize = Math.max(12, a.size * (mode === "stamp" ? 3 : 2));
  const w = Math.max(40, fontSize * 3);
  const h = fontSize;
  const pad = 4;
  
  annotationInlineInput.style.left = `${point.x - pad}px`;
  annotationInlineInput.style.top = `${point.y - h - pad}px`;
  annotationInlineInput.style.width = `${w + pad * 2}px`;
  annotationInlineInput.style.height = `${h + pad * 2}px`;
  annotationInlineInput.style.fontSize = `${fontSize}px`;
  
  annotationInlineInput.focus();
  annotationInlineInput.select();
}

function hideAnnotationInputPopover() {
  annotationInputPopover.classList.add("is-hidden");
  annotationInlineInput.classList.add("is-hidden");
  state.annotation.pendingTextLatLng = null;
  state.annotation.pendingTextMode = null;
}

function commitAnnotationTextFromPopover() {
  const a = state.annotation;
  if (!a.ctx || !a.pendingTextLatLng || !a.pendingTextMode) return;

  // Use inline input if visible, otherwise fall back to popover input
  const textValue = !annotationInlineInput.classList.contains("is-hidden")
    ? annotationInlineInput.value.trim()
    : annotationInputField.value.trim();
  
  if (!textValue) {
    hideAnnotationInputPopover();
    return;
  }

  const created = {
    id: `ann-${a.nextId++}`,
    type: a.pendingTextMode,
    latlng: { ...a.pendingTextLatLng },
    text: textValue,
    color: a.color,
    size: a.size,
  };
  a.data.push(created);
  a.selectedId = null;
  renderAnnotations();

  hideAnnotationInputPopover();
}

function placeStampAnnotation(point) {
  const a = state.annotation;
  const text = (a.stampText || "📍").trim() || "📍";
  const created = {
    id: `ann-${a.nextId++}`,
    type: "stamp",
    latlng: annotationPointToLatLng(point),
    text,
    color: a.color,
    size: a.size,
  };
  a.data.push(created);
  a.selectedId = null;
  renderAnnotations();
}

function hitTestTextOrStamp(point) {
  const a = state.annotation;
  if (!a.ctx) return null;

  for (let i = a.data.length - 1; i >= 0; i -= 1) {
    const item = a.data[i];
    if (item.type !== "text" && item.type !== "stamp") continue;
    const pt = annotationLatLngToPoint(item.latlng);
    const fontSize = Math.max(12, item.size * (item.type === "stamp" ? 3 : 2));
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

function hitTestPath(point) {
  const a = state.annotation;

  for (let i = a.data.length - 1; i >= 0; i -= 1) {
    const item = a.data[i];
    if (item.type !== "path" || !Array.isArray(item.points)) continue;
    const radius = Math.max(8, item.size * 1.25);

    const hit = item.points.some((p) => {
      const sp = annotationLatLngToPoint(p);
      return (sp.x - point.x) ** 2 + (sp.y - point.y) ** 2 <= radius ** 2;
    });

    if (hit) return { item, pt: point };
  }

  return null;
}

function hitTestAnyAnnotation(point) {
  return hitTestTextOrStamp(point) || hitTestPath(point);
}

function deleteSelectedAnnotation() {
  const a = state.annotation;
  if (!a.selectedId) return;
  a.data = a.data.filter((item) => item.id !== a.selectedId);
  a.selectedId = null;
  renderAnnotations();
}

function drawTextPreviewBox(point, toolType, size, color) {
  const a = state.annotation;
  if (!a.ctx) return;

  const fontSize = Math.max(12, size * (toolType === "stamp" ? 3 : 2));
  
  // Estimate text width for preview - use a sample or just show box
  // We'll show an empty box with the height of the font
  const w = Math.max(40, fontSize * 3); // Reasonable preview width
  const h = fontSize;
  const pad = 4;

  a.ctx.save();
  a.ctx.strokeStyle = color;
  a.ctx.lineWidth = 2;
  a.ctx.globalAlpha = 0.5;
  
  // Draw box with clearance like selected text boxes
  a.ctx.strokeRect(point.x - pad, point.y - h - pad, w + pad * 2, h + pad * 2);
  
  a.ctx.restore();
}

function renderAnnotations() {
  const a = state.annotation;
  if (!a.ctx) return;
  const rect = mapEl.getBoundingClientRect();
  a.ctx.clearRect(0, 0, rect.width, rect.height);

  for (const item of a.data) {
    if (item.type === "path") {
      if (!item.points?.length) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 1; i < item.points.length; i += 1) {
        const p0 = annotationLatLngToPoint(item.points[i - 1]);
        const p1 = annotationLatLngToPoint(item.points[i]);
        minX = Math.min(minX, p0.x, p1.x);
        minY = Math.min(minY, p0.y, p1.y);
        maxX = Math.max(maxX, p0.x, p1.x);
        maxY = Math.max(maxY, p0.y, p1.y);
        drawStrokeSegment(p0.x, p0.y, p1.x, p1.y, "draw", item.color, item.size);
      }

      if (item.id === a.selectedId && Number.isFinite(minX)) {
        const pad = Math.max(6, item.size);
        a.ctx.save();
        a.ctx.strokeStyle = "rgba(230, 57, 70, 0.95)";
        a.ctx.lineWidth = 1.25;
        a.ctx.setLineDash([5, 4]);
        a.ctx.strokeRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
        a.ctx.setLineDash([]);
        a.ctx.restore();
      }
      continue;
    }

    if (item.type === "text" || item.type === "stamp") {
      const p = annotationLatLngToPoint(item.latlng);
      const fontSize = Math.max(12, item.size * (item.type === "stamp" ? 3 : 2));
      a.ctx.save();
      a.ctx.fillStyle = item.color;
      a.ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
      a.ctx.fillText(item.text || "", p.x, p.y);

      if (item.id === a.selectedId) {
        const w = a.ctx.measureText(item.text || "").width;
        const pad = 4;
        a.ctx.strokeStyle = "rgba(230, 57, 70, 0.95)";
        a.ctx.lineWidth = 1.25;
        a.ctx.setLineDash([4, 3]);
        a.ctx.strokeRect(p.x - pad, p.y - fontSize - pad, w + pad * 2, fontSize + pad * 2);
        a.ctx.setLineDash([]);
      }

      a.ctx.restore();
    }
  }

  // Draw text preview box only for text tool while hovering
  if (a.activeTool === "text" && a.previewPoint && !a.draggingId) {
    drawTextPreviewBox(a.previewPoint, a.activeTool, a.size, a.color);
  }
}

function serializeAnnotations() {
  return JSON.parse(JSON.stringify(state.annotation.data));
}

function restoreAnnotations(data) {
  clearAnnotations();
  if (!data) return;

  if (Array.isArray(data)) {
    state.annotation.data = data;
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
      if (file.type.startsWith("video/") && file.size > 50 * 1024 * 1024) {
        player.innerHTML = `<p class="card-media-hint">Video files are too large to embed. Upload the file to your repo and use its path/URL instead.</p>`;
        fileInput.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        urlInput.value = ev.target.result;
        renderMediaPlayer(player, ev.target.result);
      };
      reader.readAsDataURL(file);
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
  const x = options.screenX ?? (mapRect.width  / 2 - 130);
  const y = options.screenY ?? (mapRect.height / 2 - 80);
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

  return card;
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
  document.body.classList.toggle("view-mode", enabled);

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
      screenX:  parseFloat(el.style.left) || 0,
      screenY:  parseFloat(el.style.top)  || 0,
      pinId:    card.pinId || null,
    };

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
    map:   { center: { lat: center.lat, lng: center.lng }, zoom: state.map.getZoom() },
    pins:  pinsArr,
    cards: cardsArr,
    annotations: serializeAnnotations(),
  };
}

function downloadJson() {
  const data = serializeBoard();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = "countermapping-board.json";
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
    link.download = `countermapping-${new Date().toISOString().slice(0, 10)}.png`;
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
  setToolsVisible(true);
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

async function applyBoard(data) {
  clearBoard();

  if (data.map) {
    state.map.setView(
      [data.map.center.lat, data.map.center.lng],
      data.map.zoom,
      { animate: false }
    );
  }

  // Create floating cards first (no geo dependency)
  for (const cd of data.cards || []) {
    if (cd.kind !== "float") continue;
    const card = createFloatingCard(cd.cardType, {
      id: cd.id, title: cd.title, screenX: cd.screenX, screenY: cd.screenY, minimized: cd.minimized,
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
      minimized: cd.minimized,
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
  requestAnimationFrame(() => updateAllAnchored());
}

async function loadBoardFromUrl(boardPath) {
  const res = await fetch(boardPath);
  if (!res.ok) throw new Error(`Cannot load board: ${boardPath}`);
  return applyBoard(await res.json());
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
  for (const layerCfg of layers) {
    try {
      const res = await fetch(layerCfg.file);
      if (!res.ok) continue;
      const geojson = await res.json();
      const renderer = L.canvas({ padding: 0.5 });
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
      // eslint-disable-next-line no-console
      console.error("Layer load error:", layerCfg.name, error);
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

  clearAnnotationsBtn.addEventListener("click", clearAnnotations);

  annotationCanvas.addEventListener("pointerdown", (ev) => {
    if (state.isViewMode) return;
    if (!annotationInlineInput.classList.contains("is-hidden")) {
      hideAnnotationInputPopover();
      state.annotation.previewPoint = null;
      renderAnnotations();
      ev.preventDefault();
      return;
    }
    const tool = state.annotation.activeTool;
    if (!state.annotation.toolsVisible) return;

    const point = getCanvasPoint(ev);
    const anyHit = hitTestAnyAnnotation(point);

    if (!tool) {
      state.annotation.selectedId = anyHit?.item?.id || null;
      if (anyHit) {
        if (anyHit.item.type === "text" || anyHit.item.type === "stamp") {
          state.annotation.draggingId = anyHit.item.id;
          state.annotation.dragDx = point.x - anyHit.pt.x;
          state.annotation.dragDy = point.y - anyHit.pt.y;
          state.annotation.dragLastX = point.x;
          state.annotation.dragLastY = point.y;
          annotationCanvas.setPointerCapture(ev.pointerId);
        } else if (anyHit.item.type === "path") {
          state.annotation.draggingId = anyHit.item.id;
          state.annotation.dragLastX = point.x;
          state.annotation.dragLastY = point.y;
          annotationCanvas.setPointerCapture(ev.pointerId);
        }
      }
      renderAnnotations();
      updateAnnotationCursor(point);
      ev.preventDefault();
      return;
    }

    if (tool === "draw") {
      state.annotation.selectedId = null;

      state.annotation.isDrawing = true;
      state.annotation.lastX = point.x;
      state.annotation.lastY = point.y;
      state.annotation.currentPath = {
        id: `ann-${state.annotation.nextId++}`,
        type: "path",
        color: state.annotation.color,
        size: state.annotation.size,
        points: [annotationPointToLatLng(point)],
      };
      state.annotation.data.push(state.annotation.currentPath);
      renderAnnotations();
      annotationCanvas.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }

    if (tool === "text") {
      const hit = hitTestTextOrStamp(point);
      if (hit) {
        state.annotation.selectedId = hit.item.id;
        state.annotation.draggingId = hit.item.id;
        state.annotation.dragDx = point.x - hit.pt.x;
        state.annotation.dragDy = point.y - hit.pt.y;
        annotationCanvas.setPointerCapture(ev.pointerId);
        renderAnnotations();
      } else {
        state.annotation.selectedId = null;
        renderAnnotations();
        placeTextAnnotation(point, tool);
      }
      ev.preventDefault();
      return;
    }

    if (tool === "stamp") {
      const hit = hitTestTextOrStamp(point);
      if (hit) {
        state.annotation.selectedId = hit.item.id;
        state.annotation.draggingId = hit.item.id;
        state.annotation.dragDx = point.x - hit.pt.x;
        state.annotation.dragDy = point.y - hit.pt.y;
        annotationCanvas.setPointerCapture(ev.pointerId);
        renderAnnotations();
      } else {
        state.annotation.selectedId = null;
        placeStampAnnotation(point);
      }
      ev.preventDefault();
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
    }
  });

  annotationCanvas.addEventListener("wheel", forwardWheelToMap, { passive: false });
  annotationInputPopover.addEventListener("wheel", forwardWheelToMap, { passive: false });

  annotationCanvas.addEventListener("pointermove", (ev) => {
    const point = getCanvasPoint(ev);
    updateAnnotationCursor(point);

    // Update text preview position only when text tool is active
    if (state.annotation.activeTool === "text" && !state.annotation.draggingId && state.annotation.toolsVisible) {
      state.annotation.previewPoint = point;
      renderAnnotations();
      return;
    }

    // Clear preview when not using text tool
    if (state.annotation.previewPoint) {
      state.annotation.previewPoint = null;
    }

    if (state.annotation.draggingId) {
      const item = state.annotation.data.find((d) => d.id === state.annotation.draggingId);
      if (item) {
        if (item.type === "text" || item.type === "stamp") {
          const newPoint = { x: point.x - state.annotation.dragDx, y: point.y - state.annotation.dragDy };
          item.latlng = annotationPointToLatLng(newPoint);
        } else if (item.type === "path" && Array.isArray(item.points)) {
          const dx = point.x - state.annotation.dragLastX;
          const dy = point.y - state.annotation.dragLastY;
          item.points = item.points.map((p) => {
            const screenPoint = annotationLatLngToPoint(p);
            return annotationPointToLatLng({ x: screenPoint.x + dx, y: screenPoint.y + dy });
          });
          state.annotation.dragLastX = point.x;
          state.annotation.dragLastY = point.y;
        }
        renderAnnotations();
      }
      updateAnnotationCursor(point);
      ev.preventDefault();
      return;
    }

    if (!state.annotation.isDrawing) return;
    const tool = state.annotation.activeTool;
    if (tool !== "draw") return;
    if (state.annotation.currentPath) {
      state.annotation.currentPath.points.push(annotationPointToLatLng(point));
    }

    renderAnnotations();

    state.annotation.lastX = point.x;
    state.annotation.lastY = point.y;
    ev.preventDefault();
  });

  const stopDrawing = () => {
    state.annotation.isDrawing = false;
    state.annotation.currentPath = null;
    state.annotation.draggingId = null;
    annotationCanvas.style.cursor = "default";
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
    if ((ev.key === "Delete" || ev.key === "Backspace") && state.annotation.toolsVisible && !state.isViewMode) {
      deleteSelectedAnnotation();
      return;
    }

    if (ev.key === "Escape") {
      hideAnnotationInputPopover();
      exitDropPinMode();
      setAnnotationTool(null);
    }
  });

  // ── Keep string SVG sized to the map container ────────────────────────────
  new ResizeObserver(() => {
    resizeStringLayer();
    resizeAnnotationCanvas();
  }).observe(mapEl);
}

// ── Baselayer management ────────────────────────────────────────────────────────
function setBaselayer(baselayerConfig) {
  if (!baselayerConfig || !state.map) return;

  // Remove the current tile layer if it exists
  if (state.currentTileLayer) {
    state.map.removeLayer(state.currentTileLayer);
  }

  // Add the new tile layer and store it
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
  const res = await fetch("data/map-config.json");
  state.mapConfig = await res.json();

  const mc = state.mapConfig.map;

  state.map = L.map("map", {
    center: mc.center,
    zoom: mc.zoom,
    zoomControl: true,
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

  const params     = new URLSearchParams(window.location.search);
  const viewParam  = params.get("mode");
  const boardParam = params.get("board");

  setViewMode(viewParam === "view");

  if (boardParam) {
    try {
      await loadBoardFromUrl(boardParam);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }
}

init().catch(console.error);
