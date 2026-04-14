const viewport = document.getElementById("viewport");
const world = document.getElementById("world");
const stringLayer = document.getElementById("string-layer");

const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const resetZoomBtn = document.getElementById("reset-zoom-btn");
const modePill = document.getElementById("mode-pill");

const mapPanelTemplate = document.getElementById("map-panel-template");
const noteCardTemplate = document.getElementById("note-card-template");

const state = {
  worldWidth: 2800,
  worldHeight: 1800,
  scale: 1,
  z: 20,
  draggingPanel: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  mapCounter: 0,
  noteCounter: 0,
  mapConfig: null,
  mapInstances: new Map(),
  connectMode: false,
  pendingPinNodeId: null,
  connectors: [],
  panning: false,
  panStartX: 0,
  panStartY: 0,
  panScrollLeft: 0,
  panScrollTop: 0,
  isViewMode: false
};

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function popupHtml(properties = {}) {
  const title = escapeHtml(properties.title || "Untitled");
  const description = escapeHtml(properties.description || "");
  const popupType = properties.popupType || "text";
  const mediaUrl = properties.mediaUrl || "";

  const body = [];
  body.push(`<h3>${title}</h3>`);
  if (description) {
    body.push(`<p>${description}</p>`);
  }

  if (popupType === "image" && mediaUrl) {
    body.push(`<img class="popup-media" src="${escapeHtml(mediaUrl)}" alt="${title}" />`);
  }

  if (popupType === "audio" && mediaUrl) {
    body.push(`<audio class="popup-media" controls><source src="${escapeHtml(mediaUrl)}" /></audio>`);
  }

  if (popupType === "video" && mediaUrl) {
    body.push(`<video class="popup-media" controls><source src="${escapeHtml(mediaUrl)}" /></video>`);
  }

  return body.join("");
}

function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

function setViewMode(enabled) {
  state.isViewMode = enabled;
  document.body.classList.toggle("view-mode", enabled);
  modePill.textContent = enabled ? "View Mode" : "Edit Mode";
  if (enabled) {
    setConnectMode(false);
    showViewHint();
  }
}

function setPanelZIndex(panel) {
  state.z += 1;
  panel.style.zIndex = String(state.z);
}

function getViewportToWorldPoint(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  const worldX = (clientX - rect.left + viewport.scrollLeft) / state.scale;
  const worldY = (clientY - rect.top + viewport.scrollTop) / state.scale;
  return { x: worldX, y: worldY };
}

function syncWorldSize() {
  world.style.width = `${state.worldWidth}px`;
  world.style.height = `${state.worldHeight}px`;
  world.style.transform = `scale(${state.scale})`;
  stringLayer.setAttribute("viewBox", `0 0 ${state.worldWidth} ${state.worldHeight}`);
  stringLayer.setAttribute("width", String(state.worldWidth));
  stringLayer.setAttribute("height", String(state.worldHeight));
}

function maybeExpandWorld(panel) {
  const left = Number.parseFloat(panel.style.left || "0");
  const top = Number.parseFloat(panel.style.top || "0");
  const right = left + panel.offsetWidth;
  const bottom = top + panel.offsetHeight;

  let resized = false;
  if (right > state.worldWidth - 120) {
    state.worldWidth = right + 600;
    resized = true;
  }
  if (bottom > state.worldHeight - 120) {
    state.worldHeight = bottom + 600;
    resized = true;
  }
  if (resized) {
    syncWorldSize();
    redrawConnectors();
  }
}

function getNodeCenter(node) {
  const panel = node.closest(".panel");
  const panelX = Number.parseFloat(panel.style.left || "0");
  const panelY = Number.parseFloat(panel.style.top || "0");
  return {
    x: panelX + node.offsetLeft + node.offsetWidth / 2,
    y: panelY + node.offsetTop + node.offsetHeight / 2
  };
}

function redrawConnectors() {
  stringLayer.innerHTML = "";
  for (const connector of state.connectors) {
    const fromNode = world.querySelector(`[data-node-id='${connector.from}']`);
    const toNode = world.querySelector(`[data-node-id='${connector.to}']`);
    if (!fromNode || !toNode) {
      continue;
    }
    const a = getNodeCenter(fromNode);
    const b = getNodeCenter(toNode);
    const bend = Math.max(60, Math.abs(b.x - a.x) * 0.35);
    const d = `M ${a.x} ${a.y} C ${a.x + bend} ${a.y - 10}, ${b.x - bend} ${b.y + 10}, ${b.x} ${b.y}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "string-path");
    stringLayer.appendChild(path);

    for (const point of [a, b]) {
      const pin = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      pin.setAttribute("cx", String(point.x));
      pin.setAttribute("cy", String(point.y));
      pin.setAttribute("r", "4");
      pin.setAttribute("class", "string-pin");
      stringLayer.appendChild(pin);
    }
  }
}

function clearPendingPinSelection() {
  state.pendingPinNodeId = null;
  world.querySelectorAll(".pin-dot").forEach((pin) => pin.classList.remove("is-active"));
}

function onPinClick(pinBtn) {
  if (!state.connectMode || state.isViewMode) {
    return;
  }
  const nodeId = pinBtn.dataset.nodeId;
  if (!nodeId) {
    return;
  }

  if (!state.pendingPinNodeId) {
    clearPendingPinSelection();
    state.pendingPinNodeId = nodeId;
    pinBtn.classList.add("is-active");
    return;
  }

  if (state.pendingPinNodeId !== nodeId) {
    state.connectors.push({ from: state.pendingPinNodeId, to: nodeId });
    redrawConnectors();
  }
  clearPendingPinSelection();
}

function startPanelDrag(event, panel) {
  if (state.isViewMode) {
    return;
  }

  const handle = event.target.closest(".panel-handle");
  const clickedControl = event.target.closest("button, input, select, textarea");
  if (!handle || clickedControl) {
    return;
  }

  const point = getViewportToWorldPoint(event.clientX, event.clientY);
  const left = Number.parseFloat(panel.style.left || "0");
  const top = Number.parseFloat(panel.style.top || "0");

  state.draggingPanel = panel;
  state.dragOffsetX = point.x - left;
  state.dragOffsetY = point.y - top;
  setPanelZIndex(panel);
}

function onPointerMove(event) {
  if (state.draggingPanel) {
    const point = getViewportToWorldPoint(event.clientX, event.clientY);
    const nextX = Math.max(0, point.x - state.dragOffsetX);
    const nextY = Math.max(0, point.y - state.dragOffsetY);
    state.draggingPanel.style.left = `${nextX}px`;
    state.draggingPanel.style.top = `${nextY}px`;
    maybeExpandWorld(state.draggingPanel);
    redrawConnectors();
  }

  if (state.panning) {
    const dx = event.clientX - state.panStartX;
    const dy = event.clientY - state.panStartY;
    viewport.scrollLeft = state.panScrollLeft - dx;
    viewport.scrollTop = state.panScrollTop - dy;
  }
}

function onPointerUp() {
  state.draggingPanel = null;
  state.panning = false;
  viewport.classList.remove("is-panning");
}

function wireDraggablePanel(panel) {
  panel.addEventListener("pointerdown", (event) => {
    setPanelZIndex(panel);
    startPanelDrag(event, panel);
  });

  const observer = new ResizeObserver(() => {
    maybeExpandWorld(panel);
    redrawConnectors();

    const mapId = panel.dataset.mapId;
    if (mapId && state.mapInstances.has(mapId)) {
      state.mapInstances.get(mapId).map.invalidateSize();
      state.mapInstances.get(mapId).annotation?.resize();
    }
  });
  observer.observe(panel);
}

function setConnectMode(nextValue) {
  state.connectMode = nextValue;
  const connectModeBtn = document.getElementById("connect-mode-btn");
  if (connectModeBtn) {
    connectModeBtn.textContent = `Connect Mode: ${state.connectMode ? "On" : "Off"}`;
  }
  if (!state.connectMode) {
    clearPendingPinSelection();
  }
}

function removePanel(panel) {
  const mapId = panel.dataset.mapId;
  if (mapId && state.mapInstances.has(mapId)) {
    state.mapInstances.get(mapId).annotation?.remove();
    state.mapInstances.get(mapId).map.remove();
    state.mapInstances.delete(mapId);
  }

  const removedNodeId = `${panel.dataset.panelId}-pin`;
  state.connectors = state.connectors.filter((c) => c.from !== removedNodeId && c.to !== removedNodeId);
  panel.remove();
  redrawConnectors();
}

function wirePinAndDelete(panel) {
  const pinBtn = panel.querySelector(".pin-dot");
  if (pinBtn) {
    const nodeId = `${panel.dataset.panelId}-pin`;
    pinBtn.dataset.nodeId = nodeId;
    pinBtn.addEventListener("click", () => onPinClick(pinBtn));
  }

  const deleteBtn = panel.querySelector(".delete-card-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      if (state.isViewMode) {
        return;
      }
      removePanel(panel);
    });
  }
}

function refreshLayerSelect(select, layers) {
  select.innerHTML = "";
  layers.forEach((cfg, idx) => {
    const option = document.createElement("option");
    option.value = String(idx);
    option.textContent = `${idx + 1}. ${cfg.name}`;
    select.appendChild(option);
  });
  select.value = "0";
}

function makeLeafletGeoJSONLayer(geojson, layerCfg) {
  return L.geoJSON(geojson, {
    style: layerCfg.style || {},
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, layerCfg.pointStyle || {}),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(popupHtml(feature.properties));
    }
  });
}

async function redrawMapLayers(mapModel) {
  mapModel.leafletLayers.forEach((layer) => {
    if (mapModel.map.hasLayer(layer)) {
      mapModel.map.removeLayer(layer);
    }
  });
  mapModel.leafletLayers = [];

  for (const layerCfg of mapModel.layerConfigList) {
    try {
      const response = await fetch(layerCfg.file);
      if (!response.ok) {
        continue;
      }
      const geojson = await response.json();
      const leafletLayer = makeLeafletGeoJSONLayer(geojson, layerCfg);
      leafletLayer.addTo(mapModel.map);
      mapModel.leafletLayers.push(leafletLayer);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Layer draw error:", error);
    }
  }
}

function restoreAnnotationFromImage(mapModel, dataUrl) {
  if (!dataUrl) {
    return;
  }
  const image = new Image();
  image.onload = () => {
    mapModel.annotation.clear();
    mapModel.annotation.drawingContext.drawImage(image, 0, 0, mapModel.annotation.width, mapModel.annotation.height);
  };
  image.src = dataUrl;
}

function initAnnotationLayer(mapModel) {
  const host = mapModel.panel.querySelector(".p5-canvas-host");
  const toolbar = mapModel.panel.querySelector(".annotation-toolbar");
  const colorInput = mapModel.panel.querySelector(".color-input");
  const sizeInput = mapModel.panel.querySelector(".size-input");
  const emojiInput = mapModel.panel.querySelector(".emoji-input");

  const sketch = (p) => {
    let isDown = false;
    let lastX = 0;
    let lastY = 0;

    const toLocal = (clientX, clientY) => {
      const rect = host.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    p.setup = () => {
      const canvas = p.createCanvas(host.clientWidth, host.clientHeight);
      canvas.parent(host);
      p.clear();
      const canvasElement = canvas.elt;

      canvasElement.addEventListener("pointerdown", (event) => {
        if (state.isViewMode) {
          return;
        }

        const local = toLocal(event.clientX, event.clientY);

        if (mapModel.currentTool === "draw" || mapModel.currentTool === "erase") {
          isDown = true;
          lastX = local.x;
          lastY = local.y;
          if (mapModel.currentTool === "erase") {
            p.erase();
          }
        }

        if (mapModel.currentTool === "text") {
          const typed = window.prompt("Enter annotation text:");
          if (typed) {
            p.noStroke();
            p.fill(colorInput.value);
            p.textSize(Math.max(Number(sizeInput.value) * 3.2, 12));
            p.text(typed, local.x, local.y);
          }
        }

        if (mapModel.currentTool === "emoji") {
          const stamp = emojiInput.value.trim() || "📌";
          p.noStroke();
          p.textSize(Math.max(Number(sizeInput.value) * 4, 16));
          p.text(stamp, local.x, local.y);
        }
      });

      canvasElement.addEventListener("pointermove", (event) => {
        if (!isDown || state.isViewMode) {
          return;
        }
        const local = toLocal(event.clientX, event.clientY);
        p.stroke(colorInput.value);
        p.strokeWeight(Number(sizeInput.value));
        p.line(lastX, lastY, local.x, local.y);
        lastX = local.x;
        lastY = local.y;
      });

      const finish = () => {
        if (mapModel.currentTool === "erase") {
          p.noErase();
        }
        isDown = false;
      };
      canvasElement.addEventListener("pointerup", finish);
      canvasElement.addEventListener("pointerleave", finish);
    };
  };

  mapModel.annotation = new p5(sketch, host);
  mapModel.annotation.resize = () => {
    mapModel.annotation.resizeCanvas(host.clientWidth, host.clientHeight);
  };

  mapModel.panel.querySelectorAll(".tool-btn").forEach((button) => {
    button.addEventListener("click", () => {
      mapModel.currentTool = button.dataset.tool;
      toolbar.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("is-active"));
      button.classList.add("is-active");
    });
  });

  mapModel.panel.querySelector(".clear-annotations").addEventListener("click", () => {
    if (!state.isViewMode) {
      mapModel.annotation.clear();
    }
  });

  mapModel.panel.querySelector(".toggle-tools-btn").addEventListener("click", () => {
    if (!state.isViewMode) {
      toolbar.classList.toggle("is-hidden");
    }
  });
}

function applyLayerOrder(layerConfigList, layerNameOrder = []) {
  if (!Array.isArray(layerNameOrder) || layerNameOrder.length === 0) {
    return layerConfigList;
  }
  const byName = new Map(layerConfigList.map((layer) => [layer.name, layer]));
  const reordered = [];
  for (const name of layerNameOrder) {
    if (byName.has(name)) {
      reordered.push(byName.get(name));
      byName.delete(name);
    }
  }
  for (const layer of byName.values()) {
    reordered.push(layer);
  }
  return reordered;
}

function updateCounterFromPanelId(panelId, type) {
  const match = panelId?.match(/(\d+)$/);
  if (!match) {
    return;
  }
  const numeric = Number(match[1]);
  if (type === "map") {
    state.mapCounter = Math.max(state.mapCounter, numeric);
  }
  if (type === "note") {
    state.noteCounter = Math.max(state.noteCounter, numeric);
  }
}

function createMapPanel(options = {}) {
  const panel = mapPanelTemplate.content.firstElementChild.cloneNode(true);
  state.mapCounter += 1;

  const panelId = options.panelId || `map-panel-${state.mapCounter}`;
  updateCounterFromPanelId(panelId, "map");
  const mapId = `leaflet-map-${state.mapCounter}`;

  panel.dataset.panelId = panelId;
  panel.dataset.mapId = mapId;
  panel.style.left = `${options.left ?? 90}px`;
  panel.style.top = `${options.top ?? 90}px`;
  panel.style.width = `${options.width ?? 720}px`;
  panel.style.height = `${options.height ?? 520}px`;
  panel.querySelector(".panel-title").textContent = options.title || `Map ${state.mapCounter}`;
  panel.querySelector(".map-root").id = mapId;

  const toolbar = panel.querySelector(".annotation-toolbar");
  if (options.toolbarVisible) {
    toolbar.classList.remove("is-hidden");
  }

  world.appendChild(panel);
  wireDraggablePanel(panel);
  wirePinAndDelete(panel);
  setPanelZIndex(panel);
  maybeExpandWorld(panel);

  const layerSelect = panel.querySelector(".layer-order");
  const layerConfigList = applyLayerOrder(
    structuredClone(state.mapConfig.layers),
    options.layerOrderNames || []
  );

  const mapModel = {
    panel,
    map: null,
    annotation: null,
    currentTool: "draw",
    layerConfigList,
    leafletLayers: []
  };
  state.mapInstances.set(mapId, mapModel);

  refreshLayerSelect(layerSelect, mapModel.layerConfigList);

  panel.querySelector(".move-layer-up").addEventListener("click", () => {
    if (state.isViewMode) {
      return;
    }
    const index = Number(layerSelect.value);
    if (index <= 0) {
      return;
    }
    const [item] = mapModel.layerConfigList.splice(index, 1);
    mapModel.layerConfigList.splice(index - 1, 0, item);
    refreshLayerSelect(layerSelect, mapModel.layerConfigList);
    layerSelect.value = String(index - 1);
  });

  panel.querySelector(".move-layer-down").addEventListener("click", () => {
    if (state.isViewMode) {
      return;
    }
    const index = Number(layerSelect.value);
    if (index >= mapModel.layerConfigList.length - 1) {
      return;
    }
    const [item] = mapModel.layerConfigList.splice(index, 1);
    mapModel.layerConfigList.splice(index + 1, 0, item);
    refreshLayerSelect(layerSelect, mapModel.layerConfigList);
    layerSelect.value = String(index + 1);
  });

  panel.querySelector(".redraw-layers").addEventListener("click", () => {
    redrawMapLayers(mapModel);
  });

  mapModel.map = L.map(mapId, {
    center: options.center || state.mapConfig.map.center,
    zoom: options.zoom || state.mapConfig.map.zoom,
    zoomControl: true
  });

  L.tileLayer(state.mapConfig.map.baselayer.url, {
    attribution: state.mapConfig.map.baselayer.attribution,
    maxZoom: 20
  }).addTo(mapModel.map);

  initAnnotationLayer(mapModel);
  redrawMapLayers(mapModel);

  requestAnimationFrame(() => {
    mapModel.map.invalidateSize();
    if (options.annotationImage) {
      restoreAnnotationFromImage(mapModel, options.annotationImage);
    }
    redrawConnectors();
  });

  return panel;
}

function createNoteCard(options = {}) {
  const panel = noteCardTemplate.content.firstElementChild.cloneNode(true);
  state.noteCounter += 1;

  const panelId = options.panelId || `note-panel-${state.noteCounter}`;
  updateCounterFromPanelId(panelId, "note");
  panel.dataset.panelId = panelId;
  panel.style.left = `${options.left ?? 220}px`;
  panel.style.top = `${options.top ?? 180}px`;
  panel.style.width = `${options.width ?? 320}px`;
  panel.style.height = `${options.height ?? 250}px`;
  panel.querySelector("h2").textContent = options.title || `Note ${state.noteCounter}`;
  panel.querySelector(".card-textarea").value = options.text || "";

  world.appendChild(panel);
  wireDraggablePanel(panel);
  wirePinAndDelete(panel);
  setPanelZIndex(panel);
  maybeExpandWorld(panel);

  return panel;
}

function clearBoard() {
  for (const mapModel of state.mapInstances.values()) {
    mapModel.annotation?.remove();
    mapModel.map.remove();
  }
  state.mapInstances.clear();
  world.querySelectorAll(".panel").forEach((panel) => panel.remove());
  state.connectors = [];
  state.mapCounter = 0;
  state.noteCounter = 0;
  state.z = 20;
  clearPendingPinSelection();
  redrawConnectors();
}

async function applyBoardState(boardState) {
  clearBoard();

  if (boardState.world) {
    state.worldWidth = Number(boardState.world.width) || state.worldWidth;
    state.worldHeight = Number(boardState.world.height) || state.worldHeight;
    state.scale = Number(boardState.world.scale) || 1;
  }
  syncWorldSize();

  const panels = Array.isArray(boardState.panels) ? boardState.panels : [];
  for (const panelState of panels) {
    if (panelState.type === "map") {
      createMapPanel({
        panelId: panelState.panelId,
        title: panelState.title,
        left: panelState.left,
        top: panelState.top,
        width: panelState.width,
        height: panelState.height,
        center: panelState.center ? [panelState.center.lat, panelState.center.lng] : undefined,
        zoom: panelState.zoom,
        layerOrderNames: panelState.layerOrderNames,
        toolbarVisible: panelState.toolbarVisible,
        annotationImage: panelState.annotationImage
      });
    }
    if (panelState.type === "note") {
      createNoteCard({
        panelId: panelState.panelId,
        title: panelState.title,
        text: panelState.text,
        left: panelState.left,
        top: panelState.top,
        width: panelState.width,
        height: panelState.height
      });
    }
  }

  state.connectors = Array.isArray(boardState.connectors) ? boardState.connectors : [];
  redrawConnectors();

  requestAnimationFrame(() => {
    viewport.scrollLeft = Number(boardState.world?.scrollLeft) || 0;
    viewport.scrollTop = Number(boardState.world?.scrollTop) || 0;
  });
}

function setZoom(nextScale) {
  state.scale = Math.max(0.2, Math.min(1.8, nextScale));
  syncWorldSize();
  redrawConnectors();
  for (const mapModel of state.mapInstances.values()) {
    mapModel.map.invalidateSize();
    mapModel.annotation?.resize();
  }
}

/** Zoom and scroll so all panels fit inside the viewport. */
function fitAllPanels() {
  const panels = [...world.querySelectorAll(".panel")];
  if (panels.length === 0) return;

  const PAD = 60; // world-px padding around content bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const panel of panels) {
    const left = parseFloat(panel.style.left) || 0;
    const top = parseFloat(panel.style.top) || 0;
    const width = parseFloat(panel.style.width) || panel.offsetWidth || 400;
    const height = parseFloat(panel.style.height) || panel.offsetHeight || 300;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, left + width);
    maxY = Math.max(maxY, top + height);
  }

  const contentW = maxX - minX + PAD * 2;
  const contentH = maxY - minY + PAD * 2;
  const scaleX = viewport.clientWidth / contentW;
  const scaleY = viewport.clientHeight / contentH;
  // Never zoom in beyond 1:1; only zoom out to fit
  const scale = Math.max(0.15, Math.min(1, Math.min(scaleX, scaleY)));

  setZoom(scale);

  requestAnimationFrame(() => {
    viewport.scrollLeft = (minX - PAD) * scale;
    viewport.scrollTop = (minY - PAD) * scale;
  });
}

function showViewHint() {
  const hint = document.getElementById("view-hint");
  if (!hint) return;
  hint.classList.add("is-visible");
  const dismiss = () => hint.classList.remove("is-visible");
  hint.addEventListener("click", dismiss, { once: true });
  setTimeout(dismiss, 8000);
}

function wireViewportPanning() {
  viewport.addEventListener("pointerdown", (event) => {
    if (event.target !== viewport) {
      return;
    }
    state.panning = true;
    state.panStartX = event.clientX;
    state.panStartY = event.clientY;
    state.panScrollLeft = viewport.scrollLeft;
    state.panScrollTop = viewport.scrollTop;
    viewport.classList.add("is-panning");
  });
}

function wireViewerEvents() {
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);

  zoomInBtn.addEventListener("click", () => setZoom(state.scale + 0.1));
  zoomOutBtn.addEventListener("click", () => setZoom(state.scale - 0.1));
  resetZoomBtn.addEventListener("click", () => setZoom(1));
}

async function loadBoardFromUrl(boardPath) {
  const response = await fetch(boardPath);
  if (!response.ok) {
    throw new Error(`Could not fetch board file: ${boardPath}`);
  }
  const boardState = await response.json();
  await applyBoardState(boardState);
}

async function init() {
  const response = await fetch("data/map-config.json");
  state.mapConfig = await response.json();

  wireViewportPanning();
  wireViewerEvents();

  const params = getQueryParams();
  const boardParam = params.get("board") || "data/boards/sample-board.json";

  // Viewer template is always read-only by default.
  setViewMode(true);

  state.worldWidth = 2800;
  state.worldHeight = 1800;
  state.scale = 1;
  syncWorldSize();

  try {
    await loadBoardFromUrl(boardParam);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    createMapPanel({ left: 90, top: 90 });
    createNoteCard({
      left: 560,
      top: 620,
      title: "Board not found",
      text: "This viewer could not load the board JSON from the URL. Confirm the file path and filename under data/boards/."
    });
  }

  // Wait two animation frames so panels have laid out before fitting
  requestAnimationFrame(() => requestAnimationFrame(fitAllPanels));
}

init().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Initialization error:", error);
});
