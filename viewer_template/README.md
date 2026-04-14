# Countermapping Viewer Template

This template is for publishing interactive board files created in the editor app.

Use this when you already have an exported `countermapping-board.json` and want a shareable GitHub Pages URL.

## Recommended Student Steps (No Coding)

1. Click **Use this template** on GitHub.
2. In your new repo, open `data/boards/`.
3. Upload your exported board JSON file.
4. Enable GitHub Pages for your repo.
5. Open this URL pattern:

```text
https://<username>.github.io/<repo>/?board=data/boards/your-board.json&mode=view
```

This is a starter workflow, not a limit. You can publish one board or many and keep extending this repo as a portfolio site.

## What Viewers Can Do

- Pan and zoom the wall.
- Open map popups.
- Play embedded audio/video in popups.

## Recommended File Location

Put your board JSON inside:

```text
data/boards/
```

Example:

```text
data/boards/countermapping-board.json
```

You can use any filename and maintain multiple board files over time.

## Testing Locally (Optional)

From repository root:

```bash
source .venv/bin/activate
python scripts/serve.py
```

Then open:

```text
http://127.0.0.1:8000/?board=data/boards/sample-board.json&mode=view
```

## Notes for Reliable Media Playback

- Prefer HTTPS media URLs.
- Prefer media hosted in this repo or another stable host.
- Some external hosts block embedding.

## Portfolio-Friendly Growth (Optional)

- Keep multiple board JSON files in `data/boards/` as your work evolves.
- Add links to each board in your repo README or a custom `index.html` landing page.
- Revisit older boards and republish updated versions as your analysis develops.
