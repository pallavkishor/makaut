/**
 * WCAG 2.1 contrast helpers plus the accessibility contract for the shared
 * brand palette.
 *
 * Both frontends run this contract as a unit test, so a well-meaning tweak to
 * a token hex cannot silently drop a real pairing below its threshold. The
 * audit lists only pairings the apps actually render.
 */

const tokens = require('./design-tokens');

function channelToLinear(value) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a `#rrggbb` string. */
function relativeLuminance(hex) {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`expected a 6-digit hex colour, received "${hex}"`);
  }
  return (
    0.2126 * channelToLinear(parseInt(h.slice(0, 2), 16)) +
    0.7152 * channelToLinear(parseInt(h.slice(2, 4), 16)) +
    0.0722 * channelToLinear(parseInt(h.slice(4, 6), 16))
  );
}

/** Contrast ratio between two `#rrggbb` colours, from 1 to 21. */
function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const c = tokens.colors;

/** Every surface text can land on. `tertiary.200` is the tightest of these. */
const SURFACES = {
  background: c.background.DEFAULT,
  white: c.background.surface,
  tertiary: c.tertiary.DEFAULT,
  'tertiary-200': c.tertiary[200],
};

const AA_NORMAL = 4.5;
const NON_TEXT = 3;

/** Pairings the apps render, each with the threshold it must clear. */
const AUDIT = [
  // Body + heading text on every light surface.
  ...Object.entries(SURFACES).map(([name, hex]) => ({
    label: `foreground on ${name}`,
    fg: c.foreground.DEFAULT,
    bg: hex,
    min: AA_NORMAL,
  })),
  // Metadata on every light surface.
  ...Object.entries(SURFACES).map(([name, hex]) => ({
    label: `muted on ${name}`,
    fg: c.muted.DEFAULT,
    bg: hex,
    min: AA_NORMAL,
  })),
  // Decorative icons and placeholders: non-text threshold.
  ...Object.entries(SURFACES).map(([name, hex]) => ({
    label: `muted-300 decorative on ${name}`,
    fg: c.muted[300],
    bg: hex,
    min: NON_TEXT,
  })),
  // Links never use primary-500 on light surfaces; 600 is the floor.
  ...Object.entries(SURFACES).map(([name, hex]) => ({
    label: `primary-600 link on ${name}`,
    fg: c.primary[600],
    bg: hex,
    min: AA_NORMAL,
  })),
  // Focus ring must stay visible on every surface (non-text minimum).
  ...Object.entries(SURFACES).map(([name, hex]) => ({
    label: `focus ring primary-600 vs ${name}`,
    fg: c.primary[600],
    bg: hex,
    min: NON_TEXT,
  })),
  // Primary button: white on the brand fill and its hover/active steps.
  {
    label: 'white on primary-500 (button fill)',
    fg: '#FFFFFF',
    bg: c.primary[500],
    min: AA_NORMAL,
  },
  {
    label: 'white on primary-600 (hover)',
    fg: '#FFFFFF',
    bg: c.primary[600],
    min: AA_NORMAL,
  },
  {
    label: 'white on primary-700 (active)',
    fg: '#FFFFFF',
    bg: c.primary[700],
    min: AA_NORMAL,
  },
  // Secondary is always paired with foreground, never white.
  {
    label: 'foreground on secondary-100',
    fg: c.foreground.DEFAULT,
    bg: c.secondary[100],
    min: AA_NORMAL,
  },
  {
    label: 'foreground on secondary-200',
    fg: c.foreground.DEFAULT,
    bg: c.secondary[200],
    min: AA_NORMAL,
  },
  {
    label: 'foreground on secondary-300',
    fg: c.foreground.DEFAULT,
    bg: c.secondary[300],
    min: AA_NORMAL,
  },
  {
    label: 'foreground on secondary-500 (tag)',
    fg: c.foreground.DEFAULT,
    bg: c.secondary[500],
    min: AA_NORMAL,
  },
  // Dark brand chrome (admin header, admin login, code blocks).
  {
    label: 'white on primary-800',
    fg: '#FFFFFF',
    bg: c.primary[800],
    min: AA_NORMAL,
  },
  {
    label: 'white on primary-900',
    fg: '#FFFFFF',
    bg: c.primary[900],
    min: AA_NORMAL,
  },
  {
    label: 'primary-100 on primary-800',
    fg: c.primary[100],
    bg: c.primary[800],
    min: AA_NORMAL,
  },
  {
    label: 'inverse text on inverse surface',
    fg: c.foreground.inverse,
    bg: c.background.inverse,
    min: AA_NORMAL,
  },
];

/**
 * Combinations that MUST stay below AA, documenting why the palette is used the
 * way it is. If one of these ever passes, the token was changed and the
 * corresponding guard-rail comment is stale.
 */
const MUST_FAIL_AA = [
  { label: 'white on secondary-500', fg: '#FFFFFF', bg: c.secondary[500] },
  {
    label: 'primary-500 as text on tertiary',
    fg: c.primary[500],
    bg: c.tertiary.DEFAULT,
  },
  {
    label: 'raw brand muted #68747D on tertiary',
    fg: c.muted[400],
    bg: c.tertiary.DEFAULT,
  },
];

module.exports = {
  relativeLuminance,
  contrastRatio,
  SURFACES,
  AUDIT,
  MUST_FAIL_AA,
  AA_NORMAL,
  NON_TEXT,
};
