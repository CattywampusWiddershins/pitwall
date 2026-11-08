# Developing Pitwall

How to run Pitwall from its source code, build the Windows installer and publish a new version. To use Pitwall, see the [README](README.md).

## Run it from the source

You need [Node.js](https://nodejs.org) (LTS) installed once.

1. Unzip this folder somewhere permanent, e.g. `Documents\Pitwall`.
2. Open a terminal in that folder (in File Explorer: type `cmd` in the address bar and press Enter).
3. Run:

```
npm install
npm start
```

`npm install` is only needed the first time. After that, `npm start` opens the app.

`node scripts/fake-f1-session.js` sends a made-up race to a running Pitwall, to check the connection.

## Build the Windows installer

```
npm run dist:win
```

This creates `dist/Pitwall-Setup-<version>.exe`, the installer. Running it installs Pitwall for your Windows user (no administrator prompt), adds it to the Start menu and the desktop, and opens it. Uninstall it from Windows Settings → Apps like any other app; your careers stay in your user folder (`AppData\Roaming\Pitwall`), so an uninstall or reinstall never touches them. Coming from the old portable `.exe`: install, then delete the portable file; everything carries over.

On a Mac use `npm run dist:mac`; on Linux `npm run dist:linux`.

Pitwall isn't code-signed, so the first time the installer runs Windows SmartScreen says it "protected your PC": click **More info → Run anyway**. Updates installed from inside Pitwall don't ask again.

## Publishing an update

Pitwall updates itself. When it starts it checks GitHub for a newer release and downloads it in the background; once it's ready, a bar at the top offers **Restart now** (Pitwall closes, installs quietly and opens again on the new version) or **Later**, and if you leave it, the update installs by itself when you close Pitwall. **Settings → Updates** shows your version, the download's progress and the release notes. To set it up once:

1. Make a GitHub repository for Pitwall (public, so the app can read its releases without signing in).
2. Put its name in `package.json` under `"pitwall": { "updateRepo": "your-name/your-repo" }`. Builds made before this is set don't check.

For each new version:

1. Commit, tag `v<version>` (matching `package.json`) and push: `git push` and `git push --tags`.
2. Build it: `npm run dist:win`.
3. Publish it: `node scripts/publish-release.js` creates the release on the version's tag, with that version's section of [CHANGELOG.md](CHANGELOG.md) as the notes, and uploads `dist/Pitwall-Setup-<version>.exe` (it uses the GitHub sign-in git saved when you pushed). Or do it on GitHub: **Releases → Draft a new release**, pick the tag, paste the notes, attach the installer and publish.

A pushed tag alone isn't an update: Pitwall only offers a version once its release is published with the installer.

Everyone on an older version is offered it the next time they open Pitwall, and their careers and settings carry over. A copy of Pitwall that wasn't installed (the old portable `.exe`) gets a **Download** button for the installer instead. The phone app updates itself from the desktop as before.

## Versions and rolling back

The project is a git repository. Every release is tagged (`v1.1.0`, `v1.2.0`, …). To see them:

```
git tag
```

To go back to a release, for example 1.1.0, and rebuild it:

```
git checkout v1.1.0
npm run dist:win
```

`git checkout main` returns to the latest version. Your career data is stored outside the project, so switching versions never touches it (an older version may not understand data saved by a newer one, so export a backup first).

## Real results data

`src/history.js` (every season from 2016 and the record book before it) is generated from the [Jolpica F1 API](https://github.com/jolpica/jolpica-f1). `src/assets.js` holds circuit outlines from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT) and flags from [flag-icons](https://github.com/lipis/flag-icons) (MIT). To rebuild them:

```
node scripts/fetch-history.js
node scripts/build-history.js
node scripts/build-assets.js
```

The first downloads into `data-raw/` (about an hour, at the API's rate limit) and only fetches what's missing on later runs.

The World Map's `src/world.js` (country shapes from Natural Earth via [world-atlas](https://github.com/topojson/world-atlas), every circuit since 1950 from `data-raw/`) and the map libraries in `src/vendor/` ([d3-geo](https://github.com/d3/d3-geo), d3-array, [topojson-client](https://github.com/topojson/topojson-client), all ISC) come from:

```
npm install --prefix <folder> d3-geo@3.1.1 d3-array@3.2.4 topojson-client@3.1.0 world-atlas@2.0.2 i18n-iso-countries@7.14.0
node scripts/build-world.js <folder>
```

## Project layout

```
main.js            Electron main process: window, file storage, API calls
preload.js         Safe bridge between the window and main process
companion.js       Phone/tablet link
src/index.html     App shell
src/styles.css     Styling
src/data.js        Grids, calendars, points, driver types (edit to change defaults)
src/reference.js   Real-world bios, circuits, team records
src/history.js     Real seasons from 2016 (generated)
src/assets.js      Circuit maps and flags (generated)
src/pool.js        F2 and F3 drivers for the transfer pool
src/app/           The app, one file per area, loaded in name order (01-core … 26-boot)
replays.js         Race recordings for Race Replay
scripts/           Data builders and a test server (node scripts/serve.js)
android/           The Android companion app
```

You can also run `node scripts/serve.js` and open http://localhost:5173 to try it in a browser; data then stays in that browser and AI media is unavailable.
