# Countermapping v3: Non-Coder Guide

This guide is for students and instructors who want to use the project without writing code.

## TLDR;

1. Put your GeoJSON files in `version_3/data/layers/`.
2. Edit `version_3/data/map-config.json`.
3. For each layer, set `name`, `file`, and `layerType` (`simple`, `categorical`, or `choropleth`).
4. For point symbols, set `pointShape` (`circle`, `square`, `diamond`) and `pointStyle.fillColor`.
5. For popups, set `map.popupLayer` (one default popup layer) or `popup.enabled` per layer.
6. If layers overlap, set `map.layerOrder` from bottom to top.
7. Run:

```bash
cd scripts
python3 serve.py
```

8. Open `http://127.0.0.1:8000/version_3/`.

## 1. What You Edit

- Your GeoJSON files in `version_3/data/layers/`
- One config file: `version_3/data/map-config.json`

You do not need to edit JavaScript files.

## 2. Quick Start

1. Put your GeoJSON files in `version_3/data/layers/`.
2. Open `version_3/data/map-config.json`.
3. Add or edit layer entries in the `layers` list.
4. Run the app:

```bash
cd scripts
python3 serve.py
```

5. Open: `http://127.0.0.1:8000/version_3/`

## 3. Basic Layer Template

Copy this and change the values:

```json
{
  "name": "My Layer",
  "file": "data/layers/my-layer.geojson",
  "layerType": "simple",
  "style": {
    "color": "#374151",
    "weight": 2,
    "fillColor": "#9ca3af",
    "fillOpacity": 0.5
  },
  "pointShape": "circle",
  "pointStyle": {
    "radius": 7,
    "fillColor": "#ef4444",
    "color": "#ffffff",
    "weight": 1,
    "fillOpacity": 0.95
  }
}
```

## 4. Layer Types

- `simple`: one style for all features.
- `categorical`: color by category field (for example `site_type`).
- `choropleth`: color polygons by numeric field (for example percentages).

## 5. Two Common Setups

### A) Choropleth plus points

- Put the choropleth layer first in drawing order.
- Put the point layer above it.
- Use `map.layerOrder` to control this (bottom to top).

```json
"map": {
  "layerOrder": [
    "Rent Burden by Tract",
    "Sites"
  ]
}
```

### B) Multiple point layers

Use different marker shape and color per layer:

- `pointShape`: `circle`, `square`, or `diamond`
- `pointStyle.fillColor`: marker color

Example combinations:

- Layer 1: circle + red
- Layer 2: square + teal
- Layer 3: diamond + blue

## 6. Legends

- Choropleth legends appear automatically.
- Categorical legends appear automatically.
- Simple layers only show legend if `showLegend: true`.

### Choropleth template

```json
{
  "name": "Rent Burden by Tract",
  "file": "data/layers/rent_burden.geojson",
  "layerType": "choropleth",
  "valueField": "rent_burden_pct",
  "legendTitle": "Rent burden (%)",
  "palette": "red-5",
  "breaks": [20, 30, 40, 50],
  "labels": ["0-20", "20-30", "30-40", "40-50", "50+"],
  "noDataLabel": "No data",
  "style": {
    "color": "#7f1d1d",
    "weight": 1,
    "fillOpacity": 0.72
  }
}
```

Built-in palettes:

- `blue-5`
- `red-5`
- `green-5`
- `orange-5`
- `viridis-5`
- `category-6`

## 7. Popups

### Choose which layer gets popups

```json
"map": {
  "popupLayer": "Sites"
}
```

### Force popup on/off for a specific layer

```json
"popup": { "enabled": true }
```

or

```json
"popup": { "enabled": false }
```

### Show custom fields from your dataset

You can use any field names in your GeoJSON. Add them to `popup.fields`.

```json
{
  "name": "Sites",
  "popup": {
    "enabled": true,
    "titleField": "site_name",
    "descriptionField": "notes",
    "fields": [
      { "field": "organization", "label": "Organization" },
      { "field": "status", "label": "Current status" },
      "phone",
      "hours"
    ]
  }
}
```

## 8. Baselayers

Built-in baselayers are in `map.baselayers`.

To change the default starting baselayer, edit `map.baselayer`.

## 9. Map Editing Features

In the app UI you can:

- add text and media notes
- pin cards to map locations
- draw annotations
- export PNG images
- save and load board JSON files

## 10. Share Read-Only Maps

1. Click Download JSON.
2. Host that JSON file (for example in `data/boards/`).
3. Share URL pattern:

```
https://your-username.github.io/your-repo/version_3/?board=data/boards/my-board.json&mode=view
```

## 11. Troubleshooting

- Layer not showing: check the `file` path in `map-config.json`.
- Wrong colors: check `layerType`, `valueField`, and color settings.
- Popups not appearing: check `map.popupLayer` and `popup.enabled`.
- Points hidden by polygons: check `map.layerOrder`.
