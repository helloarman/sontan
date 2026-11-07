# সন্তান: pregnancy tracker

Plain HTML, CSS and JavaScript with Three.js. No build step is needed to run it.

**Run it:** open `http://localhost/HTML/pregnancytrack/` with Laragon running. Opening `index.html` by double-click will not work, because browsers block `fetch` and WebGL textures on `file://`.

**Publish it:** see GitHub Pages below, or upload the contents of `_site/` to any HTTPS host. HTTPS is required for home-screen install and offline mode (`localhost` is exempt).

## GitHub Pages

Each push to `main` runs `.github/workflows/deploy.yml`, which builds `_site/` and publishes it. Only the website files go live, not `tools/`.

1. Create an empty repository on github.com (no README or licence). Free accounts need it to be **public** for Pages.
2. Push this folder, using your own repository URL:

```bash
git init -b main
```

```bash
git add .
```

```bash
git commit -m "Add pregnancy tracker"
```

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
```

```bash
git push -u origin main
```

3. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
4. Open the **Actions** tab and re-run the workflow if the first run failed before step 3.

The site appears at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

To check a build locally, run `node tools/build-site.mjs`. It fails if any file the site needs is missing or has different capitalisation.

When shipped files change, bump `VERSION` in `sw.js` so installed copies get fresh images and fonts.

`tools/source-stages.svg` is deliberately not committed (see `.gitignore`). Keep your own copy; only `npm run layers` needs it.

## Where things are

| Path | What it is |
| --- | --- |
| `data/pregnancy.json` | What to show and when: all 266 days, weeks 2-40, reminders, checkups, sources |
| `assets/days/day-001.webp` to `day-266.webp` | One image per day |
| `assets/layers/` | Separate womb and baby layers used by the 3D view |
| `js/growth.js` | Day-to-stage and size rules, shared by the app and the image baker |
| `js/scene.js` | Three.js tracker: motion, 266-bead dial, drag and tap |
| `js/app.js` | Screens, due date storage (`localStorage` key `aanchol.v1`), install flow |
| `sw.js`, `manifest.webmanifest` | Offline support and home-screen install. Bump `VERSION` in `sw.js` when shipped files change |

## Day numbering

Day N = N days after conception, and Day 266 = the due date. Weeks are counted from the last period as doctors do, so gestational age = N + 14 days.

## Changing content or images

Edit `tools/content.mjs` (text, sizes, motion) or `js/growth.js` (stage timing), then rebuild:

```bash
cd tools
npm install
npm run build
```

`npm run build` regenerates the JSON, day images and icons. It uses your installed Chrome; set `CHROME_PATH` if Chrome is somewhere else. `npm run layers` re-splits `tools/source-stages.svg` and `npm run vendor` rebuilds the Three.js bundle. Delete `tools/node_modules` afterwards.
