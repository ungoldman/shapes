# Agent Guidelines

- install: `npm install`
- run: `npm start` (port 4173. `PORT` changes it. `-- --no-open` skips browser.)
- test: `npm test`, `npm run coverage`
- format: `npm run format`

Node 22.12+. Do not alter version. Push to `main` deploys https://ungoldman.com/shape-rotator via `pages.yml`.

## Conventions

- Atomic conventional commits, `<topic>: <action>`, 50 chars max. Body only when needed. Wrap at 72.
- No AI attribution in commits.
- Breaking changes discouraged. They need `BREAKING CHANGE:` footer.
- Plain JS modules. No build. Relative paths, so page drops into any static site.
- No stylesheets or scripts from elsewhere. The page carries its own tokens.
- Few comments, kept trim.
- 100% coverage on `src/rotator.js`, `src/shapes.js`, `src/sculpt.js`, and `src/server.js`. `src/app.js` is checked in browser.

## Layout

- `src/index.html`: markup, styles, theme tokens, the ? panel with explainer, credits, and AI disclosure.
- `src/shapes.js`: the eight shapes as vertices and outward-wound faces, their edges, V E F and Euler characteristic. No DOM.
- `src/sculpt.js`: smooth union of distance fields and a marching tetrahedra mesher. No DOM.
- `src/rotator.js`: quaternion orientation, projection and zoom, gesture settling (tap, double tap, speed-up), color and op rolls, effects and their notes, key map. No DOM.
- `src/app.js`: canvas, checkerboard, effects, crossfade, readout, steering from keys and touch, pinch, wheel, theme. Keys match `event.code`.
- `src/server.js`, `src/start.js`: dev server.
