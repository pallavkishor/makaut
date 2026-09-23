import {
  evaluateSessionTimeout,
  formatCountdown,
  INACTIVITY_LIMIT_MS,
  WARNING_AFTER_MS,
} from './sessionTimeout';

const MINUTE = 60 * 1000;
const NOW = 1_700_000_000_000;

describe('evaluateSessionTimeout', () => {
  it('stays active while idle time is under the warning threshold', () => {
    const state = evaluateSessionTimeout(NOW - 24 * MINUTE, NOW);

    expect(state.phase).toBe('active');
    expect(state.msUntilLogout).toBe(6 * MINUTE);
  });

  it('warns once 25 minutes of inactivity have elapsed', () => {
    const state = evaluateSessionTimeout(NOW - WARNING_AFTER_MS, NOW);

    expect(state.phase).toBe('warning');
    expect(state.msUntilLogout).toBe(5 * MINUTE);
  });

  it('expires at exactly 30 minutes of inactivity', () => {
    const state = evaluateSessionTimeout(NOW - INACTIVITY_LIMIT_MS, NOW);

    expect(state.phase).toBe('expired');
    expect(state.msUntilLogout).toBe(0);
  });

  it('never reports negative idle time when the clock skews backwards', () => {
    const state = evaluateSessionTimeout(NOW + 5 * MINUTE, NOW);

    expect(state.idleMs).toBe(0);
    expect(state.phase).toBe('active');
  });
});

describe('formatCountdown', () => {
  it('formats remaining time as minutes and padded seconds', () => {
    expect(formatCountdown(5 * MINUTE)).toBe('5:00');
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-1)).toBe('0:00');
  });
});
