# Bricolage Map Template

Make an annotated web map in your browser and publish it as a website with GitHub Pages. No coding and nothing to install.

You get one website that does two jobs:

- **Visitors** see your finished map: your data, drawings, notes, photos and video. They can pan, zoom and open things; any edits they try remain in their own browser.
- **You** use `Edit` or add `?mode=edit` to the end of the same address to open the drawing and note tools, then download your work as one file and upload it to GitHub to publish it.

## Quick start

1. On GitHub, click `Use this template` → `Create a new repository`.
2. In your new repository, open `Settings` → `Pages`. Under `Build and deployment`, set `Source` to `Deploy from a branch`, choose branch `main` and folder `/ (root)`, and click `Save`.
3. Wait 1-2 minutes, then open your site: `https://YOUR-USERNAME.github.io/YOUR-REPO/`
4. You will see the sample map. Click `Edit` to try the tools, or open the editor directly: `https://YOUR-USERNAME.github.io/YOUR-REPO/?mode=edit`

From here, the work is three things: [add your data](#add-your-data), [annotate the map](#annotate-the-map), and [publish your board](#publish-your-board).

## What you edit

| What | Where | How |
| --- | --- | --- |
| Map title, data layers, starting view | `data/map-config.json` | Edit the text on GitHub (pencil icon) |
| Your data | `data/layers/` | Upload GeoJSON files on GitHub |
| Your drawings, notes and pins (a "board") | `data/boards/` | Made in the browser editor, downloaded, then uploaded on GitHub |
| Large photos, audio, video | `media/` | Upload on GitHub |

You do not need to edit any JavaScript, HTML or CSS.

## Name your map

At the top of `data/map-config.json`:

```json
"title": "My Neighborhood Map"
```

The title appears in the page header and browser tab, and in the names of downloaded files.

## Add your data

1. Make sure you have a local copy of your dataset in GeoJSON format. Files must be under 25 MB and use latitude/longitude coordinates.
2. Open the map editor and choose **Preview and configure data** in the Tools panel. Select the GeoJSON file to see a sample table, choose a popup title field, and select any other popup fields. You can edit the labels visitors will see.
3. Download the updated `map-config.json`. The helper does not upload or publish files; it only reads the selected file in your browser and creates the configuration.
4. On GitHub, upload the original GeoJSON file to `data/layers/` and the downloaded `map-config.json` to `data/`.
5. Commit the changes and wait 1-2 minutes for the site to update.

The helper sets up popup fields and a basic layer style. For category colors, choropleths, and other options, edit the layer entry directly using the templates in [Layer settings reference](#layer-settings-reference).

If the map shows a red "Something didn't load" box, it names the file and the problem.

## Annotate the map

Click `Edit` on the map, or open the editor by adding `?mode=edit` to the end of your site address:

```text
https://YOUR-USERNAME.github.io/YOUR-REPO/?mode=edit
```

Bookmark that address. The editing tools are in the left panel; use `Hide tools` or the panel's close button to make more room, and `Show tools` to reopen it. Visitors initially see the map without the tools panel.
The map may take a moment to load its data; editing and download controls become available when loading finishes.

**Drawing tools**

| Tool | What it does |
| --- | --- |
| Select | Click a drawing to select it, drag to move it, double-click a text label to change its words |
| Draw | Freehand drawing |
| Line, Arrow | Drag from start to end |
| Box, Circle | Drag from one corner to the other |
| Area | Click each corner of the area, then double-click (or press Enter) to finish |
| Text | Click the map and type a label |
| Stamp | Click the map to place the emoji or short text in the `Stamp` box |

- `Color` and `Size` apply to the next thing you draw. `Fill` shades the inside of boxes, circles and areas.
- `Undo` removes the most recent drawing. `Delete` (or the Delete key) removes the selected one. `Clear` removes all drawings.
- Click the active tool again, or press Esc, to put the tool away so you can drag the map.

**Notes**

- `+ Text Note` adds a card you can type in. `+ Media Note` adds a card that shows a photo, audio, video, or a YouTube, Vimeo or SoundCloud link.
- Drag a note by its title bar. Press `Add Pin` and click the map to attach the note to a place; the note then moves with the map.
- The small arrow on a note collapses it.

**Photos, audio and video**

- Paste a web link into a Media Note, or
- upload the file to the `media/` folder of your repository and type its path, for example `media/my-photo.jpg`, or
- use `Browse…` for small files. Photos are shrunk automatically and stored inside your board. Audio and video over 2 MB must go in `media/` instead.

**Saving**

- `Preview` shows the map as visitors will see it. `Edit` brings the tools back.
- Your work is backed up in your browser as you go. If you close the tab by accident, open the editor again and choose `Restore it`.
- The backup lives only in that browser on that computer. To keep your work safely, or move it to another computer, use `Download JSON`. `Load JSON` opens a downloaded file again.

## Publish your board

1. In the editor, click `Download JSON`. You get a file such as `my-neighborhood-map-board.json`.
2. On GitHub, open `data/boards/`, click `Add file` → `Upload files`, and upload it.
3. Open `data/map-config.json` and set `defaultBoard` to your file:

   ```json
   "defaultBoard": "data/boards/my-neighborhood-map-board.json"
   ```

4. Click `Commit changes`. After 1-2 minutes your site address shows your board.

To update a published map: open the editor address (your published board loads into the editor), make changes, `Download JSON`, and upload the new file to `data/boards/` with the same name so it replaces the old one.

`data/boards/sample-board.json` is the example that ships with the template. Delete it once you have your own.

## Share your map

Share your site address:

```text
https://YOUR-USERNAME.github.io/YOUR-REPO/
```

Visitors see the board named in `defaultBoard`, read-only. The view adjusts to smaller screens and phones.

More options:

- **Several boards on one site:** add `?board=` to the address, for example `https://YOUR-USERNAME.github.io/YOUR-REPO/?board=data/boards/second-board.json`
- **Hide the Edit button from visitors:** add `"showEditButton": false` to `data/map-config.json` at the top level. It is visible by default. You can still open the editor with `?mode=edit`, and return from Preview to editing. This setting hides the button, not the editor itself.
- **A picture of the map:** `Export Image` in the editor downloads a PNG.

Using the editor never changes your published site. Only files you upload to GitHub do.

## Layer settings reference

### Basic Layer Template

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

### Layer Types

- `simple`: one style for all features
- `categorical`: color by category field (for example `site_type`)
- `choropleth`: color polygons by numeric field (for example percentages)

### Point Layers: Make Them Distinct

For multiple point layers, set:

- `pointShape`: `circle`, `square`, or `diamond`
- `pointStyle.fillColor`: marker color

Example combinations:

- Layer 1: circle + red
- Layer 2: square + teal
- Layer 3: diamond + blue

### Choropleth Template

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

### Layer Order

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

### Popups

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

### Baselayers

Built-in baselayers are in `map.baselayers`.

To change the default starting baselayer, edit `map.baselayer`.

## Troubleshooting

- Red "Something didn't load" box on the map: it names the file and the problem. Fix that path or file, commit, and reload.
- Site not updating: check the `Actions` tab and wait for `pages build and deployment` to finish, then reload. Your browser may also be showing an old copy; reload again or try a private window.
- 404 on site: verify Pages source is `Deploy from a branch`, with branch `main` and folder `/ (root)`.
- Layer not showing: check the `file` path in `data/map-config.json`. Capital letters matter.
- Popups not appearing: check `map.popupLayer` and `popup.enabled`.
- Points hidden by polygons: check `map.layerOrder`.
- The site opens the editor instead of my map: set `defaultBoard` in `data/map-config.json`.
- GitHub will not accept my board file: it is over 25 MB. Move photos, audio and video into `media/` and use their paths instead of `Browse…`.
- I lost my work: open the editor in the same browser and look for the `Restore it` prompt. Download your board regularly.

## Optional local preview (instructors)

Run this from the repository folder (needs Python 3, nothing to install):

```bash
./scripts/start_local.sh
```

Then open:

```text
http://127.0.0.1:8000/
```
