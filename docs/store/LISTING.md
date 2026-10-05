# Store listing

Copy for the Microsoft Edge Add-ons and Chrome Web Store submissions. Both take
the same package; only the portals differ.

## Identity

**Name:** Zero Hour — New Tab Countdown

**Short description** (132 character limit, currently 106):

> A countdown to any date you choose on every new tab, with a dark glass interface and a cinematic backdrop.

**Category:** Productivity

**Single purpose** (Chrome requires this stated explicitly):

> Replace the new tab page with a countdown to a user-chosen date.

## Detailed description

> Every new tab becomes a countdown.
>
> Pick any date — a launch, a deadline, a trip, a release — and watch it tick
> down in months, days, hours, minutes and seconds. The months are counted as
> real calendar months, so what it shows matches what a calendar says.
>
> • A progress line showing how far through the final year you are
> • A search box that uses your own default search engine, not a hardcoded one
> • Shortcut tiles — your most-visited sites, or your own list
> • A clock with optional seconds and 12- or 24-hour time
> • Dark translucent glass surfaces that refract the backdrop behind them
>
> Everything is configurable: the date, the title, the tagline, the message when
> the clock runs out, and which elements appear at all.
>
> No accounts. No analytics. No data leaves your browser. Your settings sync
> through your own browser profile and nothing else is transmitted anywhere.
>
> All artwork is generated procedurally — no stock imagery, no third-party
> material.

## Permission justifications

Each portal asks why every permission is needed. These are accurate; do not
inflate them.

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's own settings — target date, title, tagline, and which elements are shown. Nothing else is stored, and nothing is transmitted. |
| `search` | Sends the new tab's search box to whichever search engine the user has set as their default, via `chrome.search.query`, rather than hardcoding one provider. |
| `favicon` | Draws the correct site icon on each shortcut tile using the browser's own local favicon store. Makes no network requests. |
| `scripting` | Registers the optional cosmetic stylesheet described below, and only after the user switches it on. No code is generated or injected — only a static CSS file included in the package. |
| `topSites` *(optional)* | Fills the shortcut tiles with the user's most-visited sites, matching the default new tab. Requested only when the user clicks "Show my most-visited sites", never at install. |
| Host access *(optional)* | Applies one static stylesheet, `css/web-accent.css`, which restyles scrollbars, text selection and form accent colours to match the theme. Requested only when the user enables "Carry the accent onto ordinary web pages", and revoked when they switch it off. No scripts run on pages, and no page content is read or sent anywhere. |

## Privacy answers

- **Does it collect personal or sensitive user data?** No.
- **Does it transmit data off the device?** No. There are no network requests of
  any kind; every asset is bundled.
- **Remote code?** None. No `eval`, no `new Function`, no externally hosted
  scripts. `tools/verify.mjs` checks for this.
- **Settings sync** uses the browser's own sync storage, so it travels through
  the user's browser account and never through a server of ours.

## Store icon

`store-icon-128.png` in this folder — the green mark, padded to 96x96 artwork
inside a 128x128 canvas per the store's image guidelines. This one *does* match
the package: `extension/assets/icon-128.png` is the same mark edge to edge, which
is what the manifest ships for the toolbar.

## Small promo tile

`promo-tile-440x280.png` in this folder — 440x280, 24-bit PNG, no alpha.

## Screenshots

`01-new-tab.png`, `02-any-event.png`, `03-settings.png` — all 1280x800, which
both stores accept. Lead with `01`; `02` is worth including because it shows the
extension is a general countdown, not tied to one event.

## Publishing order, and the link trap

The settings page has a "get the matching theme" link. Its target comes from
`THEME_URLS` in `extension/js/defaults.js`, and a store URL does not exist until
the item is published — so baking one in means submitting the extension a
**second** time, and waiting through review again, purely to add a link.

Avoid that. In order of preference:

1. **Point `default` at a page you control** — your repo, or a GitHub Pages page
   that links to whichever stores the theme is on. Set it once, before the first
   submission, and never resubmit the extension for a link again. It also solves
   the two-store problem on its own.
2. **Publish the theme first, then the extension.** The theme is the easier
   submission: no code, no permissions, nothing for a reviewer to question. Take
   its URL, put it in `chrome`/`edge`, then submit the extension once with a
   working link.
3. **Leave it empty.** The card then reads "the theme listings are not live yet"
   and no link is shown. Nothing looks broken — this is a fine first release.

`chrome` and `edge` override `default`, so an Edge user is never sent to the
Chrome Web Store.

## Submitting

**Edge first** is a reasonable order: registration costs nothing, so the whole
process can be walked once before paying Chrome's one-time fee. Edge runs the
same Chromium extension format, so `dist/zero-hour-extension.zip` uploads to both
unchanged.

Two things I could not verify from here, so check them rather than trust me:

1. **Whether Edge Add-ons accepts browser themes as a listing type.** Edge can
   install Chromium themes, but that is not the same as the store having a
   category for them. If it does not, publish the extension there and keep the
   theme for the Chrome Web Store.
2. **Review times.** Both stores vary, and Edge has historically been the slower
   of the two. Expect days, not hours, and do not schedule anything around it.

On Chrome, the theme is a **separate item** from the extension: two listings,
two sets of assets.

## The one open decision

The optional "accent on web pages" feature is the only part that asks for broad
host access. It is implemented the right way — opt-in, requested at the moment
the user enables it, revoked when they turn it off, and it only ever applies one
static stylesheet. But broad host permissions draw heavier review, and a
reviewer could argue a new-tab countdown that also restyles every website is two
products rather than one, against the single-purpose policy.

Keeping it is defensible. Removing it for the store build makes submission
frictionless and drops a permission from the listing. If you want it gone:

- delete `scripting` and the two `optional_host_permissions` from the manifest
- delete `js/background.js` and the `background` key
- delete `css/web-accent.css`
- remove the "Beyond the new tab" section from `options.html` and the
  `accentWeb` handling in `js/options.js` and `js/defaults.js`
- delete `tools/test-accent-sync.mjs`

That is the whole feature; nothing else depends on it.

## Before each upload

```
node tools/verify.mjs      # manifests, references, CSP, junk files, permissions
node tools/test-countdown.mjs
node tools/test-accent-sync.mjs
node tools/build.mjs       # writes dist/*.zip
```

Bump `version` in `extension/manifest.json` for every resubmission — stores
reject an upload that reuses a version number.
