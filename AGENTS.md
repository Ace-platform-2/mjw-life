# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Keep the navy launch screen and ribbon app icon. Keep Emergency and quick capture within one tap of Today. Finance records are manual.

Keep FPG Properties reachable from Today and the FPG area. Tenant contacts, arrears and site photos belong in the signed-in workspace only. Keep real work records out of committed source, fixtures and public assets.

Keep tenant files editable and omit import labels and missing-number messages. Keep building documents and the FPG phonebook private. Tenant PDF exports include the complete selected building or portfolio. Deleting a tenant keeps linked property work.

## MJW Life official brand decision (7 November 2026)

The supplied metallic teal/blue 3D ribbon is the official standalone MJW Life visual mark. The matching ribbon + exact words “MJW Life” is the primary wordmark. Always show the primary wordmark in the main platform header and on authentication. Show the standalone ribbon on loading screens, app icon, browser favicon, Today navigation, home shortcuts, branded content and recognisable product touchpoints. Keep its original geometry, colours, gloss and appearance. Do not generate variants, redraw, stretch, rotate or replace it with a generic icon.

Canonical public asset names remain `/brand/mjw-life.webp`, `/brand/mjw-ribbon.png`, `/brand/mjw-app-192.png` and `/brand/mjw-app-512.png`. When provided source images differ from existing repository assets, replace these binary files with the supplied approved brand-art files. The first is transparent ribbon + name; second is standalone ribbon. Check installed app icons and PWA manifest after replacement. Dark navy `#0c1220` is the default brand background. All future platform extensions must keep the ribbon recognisable.

Treat the ribbon as a proprietary brand identifier, not as an already registered trademark. Legal clearance and trademark registration are separate from use in the UI.
