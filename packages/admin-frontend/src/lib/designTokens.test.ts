/**
 * Accessibility contract for the shared brand palette.
 *
 * The palette lives in `design-tokens.js` at the repo root and is consumed by
 * both frontends, so this suite runs in both packages. It fails the build if a
 * token edit pushes a rendered pairing below its WCAG threshold.
 */

import tokens from '../../../../design-tokens';
import {
  AUDIT,
  MUST_FAIL_AA,
  contrastRatio,
} from '../../../../design-tokens.contrast';

describe('brand palette', () => {
  it('pins the exact brand hexes supplied by design', () => {
    expect(tokens.colors.primary[500]).toBe('#4F6F9F');
    expect(tokens.colors.primary.DEFAULT).toBe('#4F6F9F');
    expect(tokens.colors.secondary[500]).toBe('#8FAF9D');
    expect(tokens.colors.secondary.DEFAULT).toBe('#8FAF9D');
    expect(tokens.colors.tertiary.DEFAULT).toBe('#F3EFE7');
    expect(tokens.colors.background.DEFAULT).toBe('#FAFBF8');
    expect(tokens.colors.foreground.DEFAULT).toBe('#263238');
    expect(tokens.colors.border.DEFAULT).toBe('#E2E6E3');
    // The raw muted hex is preserved even though it is not the default step.
    expect(tokens.colors.muted[400]).toBe('#68747D');
  });

  it('keeps every 50-900 step defined for primary and secondary', () => {
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    for (const ramp of ['primary', 'secondary'] as const) {
      for (const step of steps) {
        expect(tokens.colors[ramp][step]).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });
});

describe('WCAG contrast contract', () => {
  it.each(AUDIT.map((a: { label: string }) => [a.label, a]))(
    '%s clears its threshold',
    (_label: string, entry: { fg: string; bg: string; min: number }) => {
      const ratio = contrastRatio(entry.fg, entry.bg);
      expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(entry.min);
    }
  );

  it.each(MUST_FAIL_AA.map((g: { label: string }) => [g.label, g]))(
    '%s stays below AA, so it is never used for body text',
    (_label: string, entry: { fg: string; bg: string }) => {
      expect(contrastRatio(entry.fg, entry.bg)).toBeLessThan(4.5);
    }
  );

  it('never pairs white with the sage secondary', () => {
    const whiteOnSage = MUST_FAIL_AA.find(
      (g: { label: string }) => g.label === 'white on secondary-500'
    );
    expect(whiteOnSage).toBeDefined();
    expect(contrastRatio('#FFFFFF', tokens.colors.secondary[500])).toBeLessThan(
      3
    );
  });
});
