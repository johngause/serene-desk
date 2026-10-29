# Serene Desk design

The mockup `design/r3-brand-serene-desk.html` set the mood (dusk palette, serif display, flat cartoon illustration, a lamp at night). This file describes the system as shipped. No photorealism. Decoration must earn its place: no ornaments added because sites "usually have them" (stray arrows, squiggles, eyebrow labels). Desktop only (Chrome, 1440 wide); there is no mobile layout.

## Stylesheets

Loaded in this order by `site/_includes/base.njk`, plus `widget/widget.css` for the chat panel.

- `site/assets/site.css`: tokens (`:root`), reset and base type, `.wrap` / `.narrow` containers, buttons, nav and footer, the home page (hero scene, desk buttons, strip, why list, Hour Cube section), global reduced-motion rule.
- `site/assets/shop.css`: product tiles and category grids, product page (stage, zoom dialog, datasheet, sticky add-to-cart bar), cart and checkout.
- `site/assets/content.css`: help-center style content pages (`.prose`, `.pending` copy-pending blocks).
- `widget/widget.css`: launcher, panel, tabs, ring visualizer. Uses the tokens from site.css.

## Tokens

Colours: dusk `#1E2630` (page), deep `#171D25`, slate `#28323E` (surfaces), line `#3A4756`, mist `#E3E7EA` (text), fog `#9AA6B0` (muted), oak `#C99A68` with oak-deep `#B58957`, lamp `#F3C26B` with lamp-hi `#F8CF84` (hover) as the only accent (CTAs, focus, active tab, mic), sage `#9DB4A3` (links, citations), ember `#E07A5F` with ember-hi `#EE917A` (sale and errors only). Single dark theme.

Other: `--ease` cubic-bezier(.22,1,.36,1); `--pool` / `--poolwarm` drive the lamp glow (higher and warmer after local sunset, set by site.js via `html[data-dusk]`).

## Type

- Display: Instrument Serif, weight 400, tight leading, `text-wrap:balance`. Italic for the one word that matters (hero).
- Body and labels: Hanken Grotesk 300-600, sentence case, untracked. No all-caps tracked eyebrows.
- Data: IBM Plex Mono only for SKUs, item IDs, prices in spec tables, codes and `[COPY PENDING]` blocks.
- `--round` (Fredoka 600) is a rounded face used only for the numerals on the Hour Cube.

## Layout

- `.wrap` is 1160 px centred; `.narrow` is 720 px, left-aligned. Gutter is 24 px.
- Content pages use an off-centre 5fr / 7fr grid (heading left, prose right, 64 px gap), prose capped near 64ch.
- Product tiles are square (`aspect-ratio:1`) on slate with a soft floor shadow and a faint lamp pool; hover lifts 4 px and scales the art slightly.
- Category grids change with item count (CSS `:has`): 4 columns by default, 2 or 3 when the category has 2 or 3 items; a 7-item category gives the first tile a 2-column lead card whose image fills the row height so captions line up. The "Pairs well with" row is always 4 columns.
- Product page: art stage (max 520 px) beside the info column, datasheet below the description. Spec rows are a label/value table; Cowork's bullet lines render as a plain muted list under it. Variant SKUs sit in a collapsed `details`.
- Cart and checkout are two-column (line items / summary, form / summary). No inputs accept card numbers.

## Components

- **Hero scene**: SVG room filling the right of the hero, edge-masked into the page. The lamp starts off on the first visit of a session, the chain auto-pulls once and the lamp snaps on (abrupt, no fade; off means no glow). Round **desk buttons** (`.deskbtns`) at the scene edge and a dial are focusable controls. Click sounds from `site/assets/sounds`.
- **Hour Cube**: solid CSS 3D cube, all faces drawn, tips to the next face (25 / 50 / 90) on click with a soft tick.
- **Buttons**: pill `.btn.lamp` (primary) and `.btn.ghost`. One primary per view.
- **Cart / checkout**: add-to-cart stays on the page (button and cart count update); sticky add-to-cart bar on product pages hides near the footer.
- **Chat widget** (`widget/widget.js`): round launcher bottom-right opens a 360 px slate panel. **Chat** and **Voice** tabs (ARIA tablist, arrow keys). Chat is silent text; Voice shows the **ring visualizer** (canvas, driven by real audio levels, states listening / speaking / muted) and runs hands-free; the mic button only mutes, Stop is the only interrupt. The help page button opens the panel. While closing, the panel is `inert` so nothing in it is tabbable; focus returns to the launcher.
- Flat SVG illustration in oak, slate and lamp gold with a light paper grain (`.grain`). No people, no photos.

## Motion

CSS-first and reserved for the light, the cube, tile hover, the chain pull, the zoom dialog, the sticky bar and the chat panel (about 220 ms in, 160 ms out). Lamp on/off is instant. `prefers-reduced-motion` is honoured twice: `site.css` collapses all animation and transition durations globally, and individual components (cube, tiles, sticky bar, panel, ring) also switch to static or low-motion states. Content is fully readable with the lamp off and without JS.

## Signature ideas

A desk lamp at dusk: every screen has one pool of warm light. The glow follows the visitor's clock (warmer after sunset). Finish swatches swap the product art's fill (oak / walnut / ash).

## Never (AI tells)

- Purple/blue gradients, glassmorphism, glowing borders on every card.
- A grid of identical rounded cards each with an icon, title and two lines.
- Tracked all-caps eyebrow labels above every heading.
- Emoji as icons; generic icon-library icons in feature rows.
- Fake social proof: stars, review counts, "trusted by", logos, and any invented facts (the site is a knowledge source).
- Newsletter sign-up at the bottom of every page.
- Fade-up-on-scroll on every section.
- Symmetric centred everything: use the off-centre grid.
