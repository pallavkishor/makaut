/**
 * Shared brand design tokens for the Educational Notes Platform.
 *
 * Single source of truth for BOTH `packages/student-frontend` and
 * `packages/admin-frontend`. Both apps deliberately share one visual
 * identity; the admin panel differentiates itself through layout density,
 * not through a different hue.
 *
 * Consumed from each package's `tailwind.config.js` via a relative require,
 * so there is no build step or workspace dependency to keep in sync.
 *
 * ---------------------------------------------------------------------------
 * Brand palette (exact, do not alter)
 * ---------------------------------------------------------------------------
 *   Primary          #4F6F9F  buttons, links, active states
 *   Secondary        #8FAF9D  highlights, secondary buttons, tags
 *   Tertiary         #F3EFE7  cards, subtle sections
 *   Main background  #FAFBF8  overall page background
 *   Text             #263238  headings + body text
 *   Muted text       #68747D  descriptions, metadata
 *   Border           #E2E6E3  card borders, dividers
 *
 * ---------------------------------------------------------------------------
 * Measured contrast (WCAG 2.1 relative luminance, computed not assumed)
 * ---------------------------------------------------------------------------
 *   #4F6F9F on #FFFFFF ......... 5.11:1  AA normal text PASS
 *   #4F6F9F on #FAFBF8 ......... 4.92:1  AA normal text PASS
 *   #4F6F9F on #F3EFE7 ......... 4.46:1  AA normal text FAIL (large only)
 *   #FFFFFF on #4F6F9F ......... 5.11:1  AA normal text PASS
 *   #68747D on #FAFBF8 ......... 4.61:1  AA normal text PASS
 *   #68747D on #F3EFE7 ......... 4.18:1  AA normal text FAIL
 *   #263238 on #FAFBF8 ........ 12.67:1  AAA
 *   #263238 on #F3EFE7 ........ 11.48:1  AAA
 *   #263238 on #8FAF9D ......... 5.51:1  AA normal text PASS
 *   #FFFFFF on #8FAF9D ......... 2.39:1  FAIL — never pair white with secondary
 *
 * Consequences encoded in the tokens below:
 *
 * 1. `muted.DEFAULT` is #5A656C, a slightly darkened #68747D on the same hue.
 *    The brand hex #68747D clears AA on the page background (4.61:1) but NOT
 *    on tertiary cards (4.18:1), and cards are exactly where metadata lives.
 *    #5A656C measures 5.76:1 on background, 5.98:1 on white, 5.21:1 on
 *    tertiary and 4.63:1 on tertiary-200, so it clears AA on every surface in
 *    the system. The original #68747D is preserved as `muted.400` for large or
 *    decorative text only.
 *
 * 2. Body/link text on light surfaces uses `primary.600` (#425D85, 5.84:1 on
 *    tertiary) rather than `primary.500`, because primary.500 lands at 4.46:1
 *    on tertiary cards. `primary.500` remains correct as a button *fill*
 *    under white text.
 *
 * 3. Secondary is a light sage. It is only ever a surface or fill, always
 *    carrying `foreground` text. `secondary.700`+ exist for text-on-light use.
 *
 * 4. Focus rings use `primary.600`: 6.45:1 on #FAFBF8 and 5.84:1 on #F3EFE7,
 *    both far above the 3:1 non-text minimum.
 */

/** Indigo-slate brand ramp. 500 is the exact brand primary. */
const primary = {
  50: '#F1F4F8',
  100: '#E4E9F2',
  200: '#C8D3E4',
  300: '#A3B5D2', // disabled fills
  400: '#7692BC',
  500: '#4F6F9F', // brand primary — button fill under white text
  600: '#425D85', // link/icon text on light surfaces, focus ring, hover fill
  700: '#354C6E', // active/pressed fill
  800: '#293B57',
  900: '#1E2D43',
  DEFAULT: '#4F6F9F',
};

/** Sage brand ramp. 500 is the exact brand secondary. Never pair with white text. */
const secondary = {
  50: '#F3F7F5',
  100: '#E7EFEA',
  200: '#CFDED5',
  300: '#B1C8BB',
  400: '#A0BBAC',
  500: '#8FAF9D', // brand secondary — fill under #263238 text only
  600: '#6F9B82',
  700: '#547D66', // text-on-light (4.66:1 on white)
  800: '#3E604D',
  900: '#2C4939',
  DEFAULT: '#8FAF9D',
};

/** Warm neutral used for cards and subtle sections. */
const tertiary = {
  50: '#FBFAF7',
  100: '#F3EFE7', // brand tertiary
  200: '#E8E2D6',
  300: '#D8D0C0',
  DEFAULT: '#F3EFE7',
};

/** Body and heading text. */
const foreground = {
  DEFAULT: '#263238',
  muted: '#5A656C',
  subtle: '#68747D',
  inverse: '#FAFBF8',
};

/**
 * Metadata / descriptions, on the same hue as the brand muted (hsl 205, 9%).
 *
 * Each step is solved so it clears its threshold against EVERY surface in the
 * system — #FAFBF8, #FFFFFF, #F3EFE7 and #E8E2D6 — not just the page
 * background. `tertiary.200` is the tightest constraint at every step.
 *
 *   300 (>=3:1 non-text, decorative icons + placeholders)
 *       bg 3.85 | white 4.00 | tertiary 3.48 | tertiary-200 3.10
 *   400 exact brand #68747D — large/decorative text only, fails on tertiary
 *   500 (>=4.5:1 AA normal text, all metadata)
 *       bg 5.76 | white 5.98 | tertiary 5.21 | tertiary-200 4.63
 */
const muted = {
  300: '#74818B',
  400: '#68747D', // exact brand muted — large/decorative text only
  500: '#5A656C', // AA-safe on background, white, tertiary AND tertiary-200
  600: '#4F5A62',
  DEFAULT: '#5A656C',
};

/** Card borders and dividers. */
const border = {
  DEFAULT: '#E2E6E3',
  strong: '#CDD4CF',
  subtle: '#EDF0EC',
};

const background = {
  DEFAULT: '#FAFBF8', // overall page background
  surface: '#FFFFFF', // elevated cards
  subtle: '#F3EFE7', // tertiary sections
  inverse: '#263238',
};

module.exports = {
  colors: {
    primary,
    secondary,
    tertiary,
    background,
    foreground,
    muted,
    border,
  },
  /** Raw hexes, exported for tests and non-Tailwind consumers. */
  brand: {
    primary: '#4F6F9F',
    secondary: '#8FAF9D',
    tertiary: '#F3EFE7',
    background: '#FAFBF8',
    text: '#263238',
    mutedText: '#68747D',
    border: '#E2E6E3',
  },
};
