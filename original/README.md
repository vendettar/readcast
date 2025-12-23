# Readcast

Readcast is a lightweight browser player for listening to an `.mp3` while reading along with a matching `.srt` subtitle file. Drop your files in and the page keeps audio and text in sync so you can jump to any line, follow along hands‑free, or copy passages for reference.

## What it does
- Plays local `.mp3` files and syncs them with `.srt` subtitles.
- Multi-language interface (English, Chinese, Japanese, Korean, German, Spanish) with instant switching.
- Built-in themes plus adjustable background tint for comfortable reading.
- Click a subtitle line to seek; quick keyboard controls for play/pause and previous/next line.
- Copy the active subtitle line with fallback handling when the Clipboard API is unavailable.

## Quick start
1) Install dependencies:
```bash
npm install
```
2) Start the local server (defaults to `http://localhost:3000`):
```bash
npm start
```
3) Open the site, drop an `.mp3` and `.srt` (in any order), then use the on-screen controls or keyboard shortcuts (`Space`, `←`, `→`).

## Project structure
- `index.html` – entry page that loads the ES module app.
- `scripts/` – modular front-end logic for state, media, files, UI, themes, i18n, and subtitles.
- `styles/` – player styles.
- `assets/` – icons and branding.
- `server.js` – minimal Express static server to avoid file:// module restrictions.

## Notes
- All processing happens in the browser; files are not uploaded anywhere.
- Some VBR `.mp3` files without proper headers may seek less accurately. Re-saving the file with a Xing/VBR header can improve jumping precision.

## Gallery cache notes
- Apple Top Podcasts is fetched via `allorigins` and cached in `localStorage` with a timestamp.
- On load, cached data is used immediately; if older than 24 hours, a refresh is attempted and the cache is updated on success.
- If the refresh fails (e.g. proxy 500), the UI continues using the cached data.
- Cache entries older than 72 hours are only replaced/cleaned up after a successful refresh, so the UI can keep showing stale data during outages.
- After any successful refresh, the app also scans `localStorage` and deletes other Apple chart/lookup cache keys older than 72 hours.

## CORS proxy configuration
- The Gallery uses `https://api.allorigins.win` as a public CORS proxy for Apple charts and (when needed) RSS feeds.
- You can provide your own allorigins-compatible proxy via `.env`:
  - `READCAST_CORS_PROXY_URL` – your proxy URL (recommended: `https://example.com/?url=` or template `...?url={url}`) that returns the raw upstream body.
  - `READCAST_CORS_PROXY_PRIMARY` – if `true`, try your proxy first; otherwise use it as a fallback.

## Credits
- Dictionary lookups are powered by the Free Dictionary API (`dictionaryapi.dev`). Thanks to meetDeveloper: https://github.com/meetDeveloper/freeDictionaryAPI

## Scripts
- `npm start` – run the local server.
- `npm run dev` – alias for `npm start`.
- `npm run lint` – lint with ESLint.
- `npm run format` – format with Prettier.
