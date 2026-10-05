# Image prompts

Drop the generated files in this folder, then run:

```
node tools/adopt-images.mjs
```

It resizes each one to the exact dimensions the packages need, writes it into
place, keeps a backup of what it replaced, and tells you whether the backdrop is
dark enough for the countdown to sit on.

## Before you generate anything

**Set the aspect ratio in the tool, not in the prompt.** Nano Banana honours the
ratio control; asking for it in words tends to get ignored and you lose pixels to
a crop. Use **16:9** for backdrops and **1:1** for the icon, and pick the largest
resolution offered (2K or 4K if available).

**Never put "Marvel", "Avengers", "Doomsday" or any film title in the prompt.**
That is what pulls trademarked shapes, the A-emblem and studio logos back into
the frame. Everything below describes the *mood* without naming a source, which
is the whole point of generating your own art.

**Composition is the hard constraint, not the subject.** The countdown sits
across the middle of the frame in white type, and a search bar plus a row of
shortcut tiles sit across the bottom third. Those areas must be dark, calm and
free of detail, or the interface stops being readable. Every prompt below says so
explicitly — keep that sentence if you rewrite anything.

---

## 1. `backdrop` — the new tab background

**Required.** This is the one that matters; everything else is optional.
Save as `backdrop.png` (`.jpg`, `.webp` and `.avif` also work). Aspect **16:9**.

Three directions below. Generate all three and pick the one that looks best
*with the interface over it*, not the one that looks best on its own.

### 1a. Looking up into the ruined nave — closest to your reference

> A cinematic film still from a dark science-fiction thriller. The interior of a
> vast ruined gothic cathedral, shot from low down looking steeply up toward an
> enormous stained-glass window. The glass is acid green and sickly emerald,
> divided by thick black lead came into irregular angular shards, several panes
> cracked or missing entirely. A single hard shaft of pale green-white light
> breaks through a gap in the upper right of the window and cuts down and to the
> left across the frame, made visible by floating dust and heavy atmospheric
> haze. Everything else falls into deep crushed black — the stone ribs, mullions
> and vaulting read as near-silhouette. Anamorphic lens, shallow depth of field,
> fine 35mm film grain, desaturated except for the greens, very high contrast
> with rich inky shadows. Compose so the horizontal middle of the frame is the
> darkest and emptiest part of the picture, keep all bright light confined to the
> upper right quadrant, and keep the lower third quiet and dark. No text, no
> letters, no numbers, no logos, no signage, no people, no border or frame.

### 1b. Close on the shattered glass — more texture, less architecture

> Extreme close-up of a shattered stained-glass window filling the frame. Thick
> black lead came separates irregular panes of acid green, deep emerald and
> bottle-green glass, mottled and pitted with age, some panes spiderwebbed with
> cracks and one punched clean through. Backlit by a single cold green-white
> source behind the upper right of the glass, throwing a soft bloom and a faint
> volumetric shaft forward through the broken pane into drifting dust. The glass
> darkens steeply toward the edges and the centre of the frame falls almost to
> black. Macro photography, shallow depth of field, heavy film grain, cinematic
> colour grade with crushed blacks and no warm tones. The middle of the image
> must be dark, soft and free of detail, and the lower third dark and quiet. No
> text, no letters, no numbers, no logos, no people, no border or frame.

### 1c. The window across a flooded hall — most depth

> A wide cinematic shot down a long abandoned gothic hall, half-flooded with
> still black water that mirrors the ceiling. At the far end a tall arched
> stained-glass window glows sickly green in the darkness, its lead came reading
> as a black web across the light. One hard shaft of green-white light falls from
> it down and to the left through thick haze. Crumbling stone columns recede into
> blackness on both sides, lit only by the edge of that glow. Desaturated
> cinematic grade, deep crushed blacks, fine film grain, subtle anamorphic flare,
> shallow depth of field. The centre of the frame at eye level must stay dark and
> empty, and the lower third must be calm and unlit. No text, no letters, no
> numbers, no logos, no people, no border or frame.

---

## 2. `backdrop-theme` — optional

Only needed if you want a *different* picture behind the new tab when the
extension is switched off and the theme alone is doing the work. Save as
`backdrop-theme.png`, aspect **16:9**. Skip it and the adopt script reuses
`backdrop` for both.

One difference if you do generate a dedicated one: nothing is drawn on top of
it, so it can afford a brighter, busier centre. Drop the "middle of the frame
must be dark" sentence from whichever prompt you use.

---

## 3. `icon` — optional, and read the caveat first

Save as `icon.png`, aspect **1:1**, transparent background if your tool offers it.

> A minimal flat app icon centred on a near-black background. The emblem is a
> bold simple hourglass rendered in glowing acid green, enclosed by a thin
> circular ring that is cleanly broken with a single gap on the right side.
> Perfectly centred and symmetrical, heavy even strokes, generous empty space
> between the hourglass and the ring, strong contrast against the dark plate, a
> subtle outer glow. Flat vector design, not photographic. No bevels, no 3D, no
> reflections, no gradients along the strokes. No text, no letters, no numbers,
> no watermark.

**The caveat:** Chrome draws this at 16px in the toolbar. Generated icons almost
always turn to mush at that size, because they carry fine detail that cannot
survive the downscale. The procedural icon is drawn with signed distance fields
and stays crisp at every size, 16px included.

Swap it only if you look at the 16px result and still prefer it. To go back:

```
node tools/gen-assets.mjs
```

---

## Do not generate these

| File | Why not |
| --- | --- |
| `theme_frame.png`, `theme_toolbar.png`, `theme_tab_background.png` | Chrome tiles these horizontally across the whole window. They must be seamless and exactly the right height, and any generated texture shows a repeating seam every few hundred pixels. The procedural gradients are correct and effectively invisible anyway. |
| `theme_button_background.png` | Same reason, at 32×32. |
| `grain.png` | A seamless tiling noise tile. Generated noise does not tile, so you get a visible grid of repeats across the screen. |

---

## Judging a result

Check each candidate against these. The first two are what actually sink an image:

1. **Is the centre dark?** Cover the middle third with your hand. If there is
   bright detail where the digits go, the countdown will not read. The adopt
   script measures this and prints the number.
2. **Is there hidden lettering?** Image models love writing fake text into glass,
   stone and signage. Zoom into the panes. Any letterforms at all — regenerate.
3. **One light source only.** Two competing highlights make the frame busy and
   the type ends up fighting both of them.
4. **No accidental emblem.** Watch for the tracery forming a letter shape,
   especially converging diagonals making an **A**. I hit exactly this while
   drawing the procedural version — the first render had diagonal rakes that read
   unmistakably as the logo, and I rebuilt the window as a round-headed arch to
   kill it. If the structure reads as a letter or a badge, regenerate.
5. **Judge it in place, not in a viewer.** Run the adopt script, then
   `node tools/shoot.mjs newtab 1600 900` and open the screenshot it writes. An
   image that is gorgeous on its own is very often wrong behind an interface.

## If it comes out too bright

You do not need to regenerate. Open `extension/css/tokens.css` and lower the
grade applied to the backdrop:

```css
--plate-brightness: 0.68;   /* toward 0.4 darkens; toward 1 keeps more of the art */
--plate-saturate:   1.08;
--plate-contrast:   1.06;
```

The adopt script prints the exact value to try. For reference, the procedural
backdrop measures **0.113** raw and **0.077** after grading, and white type sits
on that comfortably.

## Putting it back

`tools/adopt-images.mjs` copies whatever it is about to overwrite into
`tools/.previous/`. To return to the fully procedural art at any point:

```
node tools/gen-assets.mjs
```
