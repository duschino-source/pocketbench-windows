# PocketBench brand and interface

The current mark is an interlocking white P/B monogram with a blue joining piece. Its shapes suggest fitted components and completed repair work.

## Provenance

- Concept generated with Meta Muse Image 1.0 through the metered development gateway.
- Muse Spark 1.3 produced an initial vector interpretation.
- Codex refined the vector paths against the selected concept, adjusted optical spacing, and produced the wordmark and Windows icon exports.
- The original selected generation is retained as resources/brand/muse-concept.png. No external image or web references were enabled for generation.
- The SVG master is resources/brand/mark.svg. Run node tools/generate-icons.cjs to regenerate the PNG wordmark and nine Windows ICO sizes using the development-only resvg renderer.

## Generation prompt

> Design one exceptional original logo SYMBOL for PocketBench, a Windows repair desktop app. A compact P/B monogram made from two precisely fitted geometric components, like two machined parts joined to repair a system. A strong almost-square asymmetric silhouette, bold white body, generous black negative space that subtly reveals P and B, and a single small blue #6e9fff component at the top-right as the joining piece. Distinctive, calm, premium, instantly recognizable at small icon sizes. Flat clean vector geometry on uniform pure #000000. One symbol only, centered, no text. Excellent optical balance, sturdy proportions, no hairlines. Avoid looking like a plain font glyph. No generic shield or floating checkmark, no brain, robot, circuit, AI sparkle, gradient, 3D bevel, glow, texture, scene, presentation board, app mockup, or copied existing trademark.

## Interface rules

The main canvas and sidebar are pure #000000. Surfaces use neutral #050505, #080808, and #121212 with one blue accent, #6E9FFF. Primary text is #F5F5F5; supporting text uses neutral grays. Status is stated with words and recognizable icons; it does not depend on red, green, or yellow.

Segoe UI provides the interface type scale; Consolas is reserved for technical evidence. Body copy is capped at 65ch. Layout spacing and Fluent spacing tokens follow a 4px grid. Links are the only underlined text.

Initial entry and infrequent repair feedback animate transform/opacity for 120–240ms with ease-out timing. Navigation, app selection, filtering, and searching receive no repeated animation. Controls have physical press feedback and visible keyboard focus. Reduced motion disables transition effects.

Program icons are identity content, rather than additional decorative UI colors. Win32 icons come from the installed program's registered executable or ICO. Store artwork comes from its installed package manifest and local PNG assets. Missing artwork falls back to the generic application icon extracted from the user's own Windows installation. No Windows stock image is redistributed in the repository. A Fluent application-window symbol remains available if Windows icon extraction is unavailable.

Icon requests carry only a discovered application ID. The main process refuses unknown targets, URLs, UNC paths, linked directories, and escaping Store asset paths. It never launches the program to retrieve its icon.
