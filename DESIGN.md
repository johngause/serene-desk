# Serene Desk design (locked)

Brand is fixed by `design/r3-brand-serene-desk.html` and handoff §3. Design skills (Hallmark, Impeccable) may refine spacing, hierarchy, motion and detail. They never replace the palette, fonts or concept.

## Tokens

dusk `#1E2630` (page), slate `#28323E` (surfaces), line `#3A4756`, mist `#E3E7EA` (text), fog `#9AA6B0` (muted), oak `#C99A68`, lamp `#F3C26B` (the only accent: CTAs, mic, focus), sage `#9DB4A3` (links, citations), ember `#E07A5F` (sale and errors only). Single dark theme.

Type: Instrument Serif display (italic for the one word that matters), Hanken Grotesk body, IBM Plex Mono for SKUs, order IDs, error codes and spec tables.

## The idea that runs the site

A desk lamp at dusk. Every screen has one pool of warm light, and it is the thing that moves. Illustrations are flat SVG in oak, slate and lamp gold, with a light paper grain over them so they read as printed, not vector-generated. No people, no photos.

## Borrowed from real shops

- **Grovemade** (desk goods, same category): product pages that feel like a workshop bench. Large product art, a materials-and-finish swatch row, a quiet sticky add-to-cart bar on scroll.
- **Teenage Engineering**: specs as a mono datasheet table, not icon bullets.
- **Headspace**: flat illustration with soft, slow loops; calm without being empty.
- **Aesop**: restraint. Long lines of copy, few boxes, generous dark space.

## Signature interactions (cheap, CSS-first, all respect `prefers-reduced-motion`)

1. **Lamp pull-chain** in the hero: tap or drag the chain and the pool of light warms up. Default state is lit, so nothing depends on it.
2. **Hour Cube** section: the cube tips over to the next face (25 / 50 / 90) on hover or tap.
3. **Light follows the visitor's clock**: the glow shifts warmer after sunset local time. One CSS variable set by a few lines of JS; default looks right without JS.
4. **Finish swatches swap the SVG fill** of the desk illustration (oak / walnut / ash), so the selector visibly does something even though checkout is fake.
5. **Hand-drawn margin notes**: wobbly SVG arrows and underlines (pen-stroke paths, not a font) on the size guide and Hour Cube. Text in them comes from Cowork's copy only.

## Never (AI tells)

- Purple/blue gradients, glassmorphism, glowing borders on every card.
- A grid of identical rounded cards each with an icon, title and two lines.
- Tracked all-caps eyebrow labels above every heading; one coloured word in every headline.
- Emoji as icons; generic icon-library icons in feature rows.
- Fake social proof: stars, review counts, "trusted by", logos. (They would also feed the knowledge crawl.)
- Newsletter sign-up at the bottom of every page.
- Fade-up-on-scroll on every section. Motion is reserved for the light, the cube and the swatches.
- Symmetric centered everything: use an off-center grid, let illustrations bleed off the edge.
