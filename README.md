# GitHub Pages Guide

This guide is for students and instructors using GitHub (in the browser) and GitHub Pages.

## TLDR;

1. Create your own copy using `Use this template` on GitHub.
2. In repo settings, enable GitHub Pages from `GitHub Actions`.
3. Upload GeoJSON files into `data/layers/`.
4. Edit `data/map-config.json` to point to your layers.
5. Commit changes in GitHub.
6. Wait for the Pages deploy action to finish.
7. Open your live map: `https://YOUR-USERNAME.github.io/YOUR-REPO/`.
8. Share a view-only link with `?board=data/boards/your-board.json&mode=view`.

## 1. What You Edit

- Your GeoJSON files in `data/layers/`
- One config file: `data/map-config.json`

You do not need to edit JavaScript files.

## 2. First-Time GitHub Setup

1. Open the template repository.
2. Click `Use this template` and create your own repository.
3. In your new repository: `Settings` -> `Pages`.
4. Under `Build and deployment`, choose `GitHub Actions`.
5. Commit any change to trigger deployment.

Your live URL format is:

```text
https://YOUR-USERNAME.github.io/YOUR-REPO/
```

## 3. Add Data (Browser-Only Workflow)

1. In GitHub, open `data/layers/`.
2. Click `Add file` -> `Upload files` and upload your GeoJSON.
3. Open `data/map-config.json` and click the pencil icon to edit.
4. Add or update your layer entries.
5. Click `Commit changes`.
6. Wait 1-2 minutes for Pages to redeploy.

## 4. Basic Layer Template

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

## 5. Layer Types

- `simple`: one style for all features
- `categorical`: color by category field (for example `site_type`)
- `choropleth`: color polygons by numeric field (for example percentages)

## 6. Point Layers: Make Them Distinct

For multiple point layers, set:

- `pointShape`: `circle`, `square`, or `diamond`
- `pointStyle.fillColor`: marker color

Example combinations:

- Layer 1: circle + red
- Layer 2: square + teal
- Layer 3: diamond + blue

## 7. Choropleth Template

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

## 8. Layer Order

Use `map.layerOrder` to control draw order from bottom to top.

```json
"map": {
  "layerOrder": [
    "Rent Burden by Tract",
    "Sites"
  ]
}
```

In this example, the choropleth draws first and points draw above it.

## 9. Popups

Choose one default popup layer:

```json
"map": {
  "popupLayer": "Sites"
}
```

Override popup behavior per layer:

```json
"popup": { "enabled": true }
```

or

```json
"popup": { "enabled": false }
```

Show custom dataset fields in popups:

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

This lets students keep original dataset column names.

## 10. Baselayers

Built-in baselayers are in `map.baselayers`.

To change the default starting baselayer, edit `map.baselayer`.

## 11. Editor and Viewer Links

Editor URL:

```text
https://YOUR-USERNAME.github.io/YOUR-REPO/
```

Viewer URL with a saved board:

```text
https://YOUR-USERNAME.github.io/YOUR-REPO/?board=data/boards/my-board.json&mode=view
```

## 12. Save and Share Boards

1. In the editor, click `Download JSON`.
2. In GitHub, upload that file to `data/boards/`.
3. Share the viewer URL using the uploaded board path.

## 13. Troubleshooting

- Site not updating: check the `Actions` tab and wait for deploy to finish.
- 404 on site: verify Pages source is `GitHub Actions`.
- Layer not showing: check the `file` path in `data/map-config.json`.
- Popups not appearing: check `map.popupLayer` and `popup.enabled`.
- Points hidden by polygons: check `map.layerOrder`.

## 14. Optional Local Preview (Instructors)

If you want local preview:

```bash
cd scripts
python3 serve.py
```

Then open:

```text
http://127.0.0.1:8000/version_3/
```
