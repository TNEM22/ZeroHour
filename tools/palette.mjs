/**
 * Palettes. Each one is a complete set; the UI switches between them by name.
 *
 * All three are dark-based on purpose. The countdown is white type sitting
 * directly on the backdrop, so a light palette would not survive — what changes
 * is the hue of the light and the glass, not the darkness underneath it.
 *
 * Mirrored as CSS custom properties in extension/css/tokens.css. Change a value
 * here, run `node tools/gen-assets.mjs`, and update that mirror.
 */
export const PALETTES = {
  // Toxic green. The original.
  zero: {
    label: 'Zero',
    void:      [  4,   7,   6],
    abyss:     [  8,  14,  12],
    pitch:     [ 11,  21,  17],
    panel:     [ 14,  26,  21],
    glassDeep: [ 10,  38,  24],
    glass:     [ 24,  74,  44],
    glassLit:  [ 86, 170,  96],
    core:      [ 81, 212, 106],
    glow:      [182, 244, 186],
    shaft:     [232, 255, 230],
    bone:      [232, 239, 233],
    ash:       [143, 163, 151],
    rust:      [120,  86,  44],
    lead:      [  6,  11,   9],
  },

  // Hot metal: crimson falling to gold.
  ember: {
    label: 'Ember',
    void:      [  7,   4,   4],
    abyss:     [ 15,   9,   7],
    pitch:     [ 22,  12,  10],
    panel:     [ 28,  15,  12],
    glassDeep: [ 42,  15,  11],
    glass:     [ 82,  29,  19],
    glassLit:  [182,  92,  54],
    core:      [224,  83,  48],
    glow:      [246, 198, 132],
    shaft:     [255, 242, 222],
    bone:      [240, 233, 228],
    ash:       [166, 148, 140],
    rust:      [142,  96,  40],
    lead:      [ 11,   6,   5],
  },

  // Gilded light: deep warm black lit by white gold.
  astra: {
    label: 'Astra',
    void:      [  8,   6,   3],
    abyss:     [ 17,  13,   7],
    pitch:     [ 25,  19,  10],
    panel:     [ 32,  24,  13],
    glassDeep: [ 48,  35,  13],
    glass:     [ 96,  71,  26],
    glassLit:  [200, 164,  90],
    core:      [230, 184,  90],
    glow:      [252, 238, 198],
    shaft:     [255, 252, 242],
    bone:      [245, 239, 228],
    ash:       [170, 158, 137],
    rust:      [136, 102,  44],
    lead:      [ 12,   9,   4],
  },
};

/**
 * A theme-only palette. The browser frame is a thin near-black strip, and the
 * three palettes above differ there by only a few points of hue — so one
 * graphite theme sits correctly under all of them. That means one theme listing
 * to publish and maintain instead of three.
 *
 * Deliberately not part of PALETTES: it is not an option in the extension's
 * palette picker, only a package to publish.
 */
export const NEUTRAL = {
  label: 'Graphite',
  void:      [  6,   6,   7],
  abyss:     [ 12,  12,  14],
  pitch:     [ 18,  18,  20],
  panel:     [ 24,  24,  27],
  glassDeep: [ 28,  30,  33],
  glass:     [ 52,  55,  60],
  glassLit:  [130, 136, 142],
  core:      [168, 176, 182],
  glow:      [214, 220, 224],
  shaft:     [244, 247, 248],
  bone:      [232, 236, 238],
  ash:       [148, 154, 158],
  rust:      [ 96,  88,  76],
  lead:      [  8,   8,   9],
};

/** The default, kept as a named export so existing imports still work. */
export const PALETTE = PALETTES.zero;

export const hex = (c) =>
  '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
