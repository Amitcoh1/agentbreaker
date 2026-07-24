# Breakerbox brand kit

## Palette
| Role | Hex | Usage |
|---|---|---|
| Ink | `#1f2328` | Primary text, panel outline, dark surfaces |
| Paper | `#faf9f5` | Light backgrounds (primary mode) |
| Cream | `#f5f3ec` | Text/marks on dark surfaces |
| Brass | `#b8860b` (light) / `#d4a017` (dark) | THE TRIPPED SWITCH ONLY. Plus primary CTA. Nowhere else. |
| Slate | `#6b7280` | Secondary text |

## The one rule
Brass is earned, never decorative. It appears when something tripped, on the flipped switch in the logo, and on the primary CTA. If brass shows up in a third place on any screen, remove one.

## Files
- `logo-light.svg` / `logo-dark.svg` — full wordmark + tagline (README header, site)
- `mark-light.svg` / `mark-dark.svg` — 128px square (GitHub org/avatar, PyPI, social)
- `favicon.svg` — 32px (browsers render SVG favicons natively; add `<link rel="icon" href="/favicon.svg">`)
- `og-image.svg` — 1200x630 social card template (convert to PNG for og:image: `npx svgexport og-image.svg og-image.png` or any converter, since og:image must be raster)

## Typography
Wordmark: Inter 600, tight letter-spacing, all lowercase.
Code contexts: system monospace.
Never use pure black (#000) or pure white (#fff).

## Naming
Brand/product: Breakerbox. Python package remains `breakerbox` (or `breakerbox` if verified free on PyPI). Tagline: "your agents can't outspend you" or formal variant "the circuit breaker for AI agents".
