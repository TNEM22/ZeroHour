# Theme listing — Zero Hour — Graphite

The first thing to publish. A theme has no code and no permissions, so there is
very little for a reviewer to question — which is exactly why it goes first:
you learn the portal on the low-risk item, and you come away with the URL the
extension needs.

## Identity

**Name:** Zero Hour — Graphite

**Short description** (132 character limit, currently 93):

> A dark graphite browser theme: deep glass surfaces, built for low light.

**Category:** Themes (or the nearest your portal offers)

## Detailed description

> A quiet, near-black browser theme.
>
> Graphite greys across the frame, tab strip, toolbar and address bar, with
> light silver icons that stay legible without glaring. No colour cast, so it
> sits under anything without fighting it.
>
> Built as the companion to the Zero Hour new tab countdown, and deliberately
> neutral so it works with every palette that extension offers — but it stands
> on its own as a plain dark theme if that is all you want.
>
> All artwork is generated procedurally. No stock imagery, no third-party
> material.

## Store icon

`store-icon-128.png` in this folder — the hourglass in the theme's own graphite,
so the listing icon matches what gets installed.

It is drawn with the artwork at 96x96 inside the 128x128 canvas, leaving
transparent padding, which is what the store's image guidelines ask for and what
stops it looking oversized next to other icons in a grid. If the portal preview
looks too small, `extension/assets/icon-128.png` is the edge-to-edge version.

Note this is a **listing asset only**. A theme manifest has no `icons` key, so
the icon is not part of the package and is never uploaded inside the zip.

## Small promo tile

`promo-tile-440x280.png` in this folder. Already 440x280 and **24-bit PNG with
no alpha channel**, which is what the portal asks for — a normal PNG export
carries an alpha channel and gets rejected.

Regenerate with `node tools/promo.mjs` if the wording changes.

## Screenshots — you have to take these yourself

This is the one asset that cannot be generated. A theme changes the browser
chrome, and browser chrome only exists in a real window — a headless render has
no frame, no tab strip and no toolbar to capture.

**Do not use a new tab screenshot from the extension.** It shows the countdown
page, which this theme does not provide, and someone installing from it will
expect a feature they do not get. Do not use a flat colour swatch either; it
shows nothing about what actually changes.

### What a good one shows

The parts the theme actually paints, in roughly this priority:

1. The **window frame and tab strip**, with at least two tabs open so the
   inactive tab colour is visible next to the active one
2. The **toolbar and address bar** — click into the omnibox so its styling shows
3. The **bookmarks bar**, if you use it

The page content underneath matters far less than the chrome around it. An
ordinary website is a perfectly good choice and arguably the most honest one,
because it shows the theme doing its job without implying anything else.

### Taking them

1. `chrome://extensions` → **Load unpacked** → `themes/neutral`
2. Size the window to about **1280x800**
3. Open two or three tabs, click into the address bar
4. Capture the **whole window**, frame included — not just the page
5. Crop to exactly 1280x800

Two or three is plenty.

### Showing it with the extension

You may include one screenshot of the theme around the Zero Hour new tab — it is
the intended pairing and it looks good. Two conditions:

- It must not be the **only** screenshot. Lead with one that is clearly about the
  browser chrome
- Say so in the caption or description: the countdown comes from the separate
  extension, not from this theme

That keeps it accurate rather than implying the theme ships a new tab page.

## Privacy answers

A theme contains no code and makes no requests.

- **Collects personal or sensitive data?** No.
- **Transmits data?** No.
- **Remote code?** None — a theme cannot execute anything.
- **Permissions?** None. A theme manifest has no `permissions` key at all.

## After it is published

Copy the listing URL into `extension/js/defaults.js`:

```js
export const THEME_URLS = {
  default: '',
  chrome: 'https://chromewebstore.google.com/detail/...',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/...',
};
```

Then run `node tools/release.mjs` and submit the extension with a link that
already works. That is the whole point of going theme-first — you never have to
resubmit the extension just to add it.

If you publish to both stores, fill in both keys. The extension picks the right
one from the user agent, so an Edge user is never sent to the Chrome store.

## The other three themes

`themes/zero`, `themes/ember` and `themes/astra` match the extension's palettes
exactly. They are not worth separate listings — the browser frame is near-black
in all three and the difference is a few points of hue — but they are in the repo
for anyone who wants to load one unpacked.
