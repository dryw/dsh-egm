# Diagram assets

The two SVG diagrams embedded in [README.md](../../README.md) are authored in
[D2](https://d2lang.com), so they can be edited as text and re-rendered without a design tool.
The sources and the rendered SVGs both live in this directory (`docs/assets/`).

| D2 source | Rendered SVG | Used by |
|---|---|---|
| [`workflow.d2`](workflow.d2) | [`workflow.svg`](workflow.svg) | README ("How it works") |
| [`protocol.d2`](protocol.d2) | [`protocol.svg`](protocol.svg) | README (the five-phase protocol section) |

## Edit and re-render

1. Install the D2 CLI from <https://d2lang.com/tour/install> (or download a
   release binary; it is not an npm dependency of this package). The diagrams are
   known to render with D2 v0.9.0.
2. Edit the `.d2` file.
3. Re-render both SVGs from the repository root:

   ```sh
   node adapters/dsh/render_diagrams.mjs

   # or point at a specific D2 binary:
   D2=/path/to/d2 node adapters/dsh/render_diagrams.mjs
   ```

The render script
([`adapters/dsh/render_diagrams.mjs`](../../adapters/dsh/render_diagrams.mjs)) passes the right flags
per diagram, then adds the accessibility metadata D2 does not emit: `width`/`height`, `role="img"`,
`aria-label` and a `<title>`. It also paints an adaptive light/dark background behind D2's
transparent canvas, so an SVG opened on its own page is readable too.

## Theming

- **Both diagrams are adaptive.** Each source declares `vars.d2-config` with
  `theme-id: 0`, `dark-theme-id: 200` and its own padding (`protocol.d2` also sets
  `pad: 55`), so D2 embeds both themes in the SVG behind a
  `prefers-color-scheme: dark` block. Theme-generated fills and text adapt to
  the reader's page (`<img>` on a dark page renders the dark variant); the
  explicit blue/orange/violet role accents stay fixed.
- **The canvas is adaptive too.** The render script paints a full-canvas
  `#FFFFFF` / `#1E1E2E` background behind the drawing, so a standalone SVG page
  is readable on its own rather than showing a transparent checkerboard.
- Both are rendered with D2's defaults so that `d2-config` applies. The
  protocol sequence diagram is intentionally tall; it is embedded in the README's
  five-phase protocol section.

## What is shipped

Only the two rendered SVGs linked above are packaged (they are the README's images). The `.d2`
sources, this README and the renderer under `adapters/dsh/` are repository-only maintenance
material and are excluded from the npm tarball. `npm test` checks the package manifest's packed
paths, not the SVG contents; re-rendering is only needed for a visual change.
