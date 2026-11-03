import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/renderer/styles.css', 'utf8');

describe('motion system contract', () => {
  it('defines the shared duration and easing tokens', () => {
    expect(css).toContain('--pb-duration-fast: 120ms');
    expect(css).toContain('--pb-duration: 180ms');
    expect(css).toContain('--pb-duration-slow: 240ms');
    expect(css).toContain('--pb-ease-out: ease-out');
  });

  it('animates only through the token scale (no ad-hoc long animations)', () => {
    const animations = [...css.matchAll(/animation:\s*([^;]+);/g)].map((match) => match[1] ?? '');
    expect(animations.length).toBeGreaterThan(0);
    for (const animation of animations) {
      if (animation.includes('none')) continue;
      expect(animation, animation).toMatch(/var\(--pb-duration/);
      expect(animation, animation).not.toMatch(/\b([3-9]\d{2}|[1-9]\d{3,})ms\b/);
    }
  });

  it('styles search, palette, and content entry without new keyframes', () => {
    for (const selector of [
      '.pb-findings-search',
      '.pb-match',
      '.pb-palette-backdrop',
      '.pb-palette-item',
      '.pb-inspector-content',
      '.pb-plan-result',
    ]) {
      expect(css, selector).toContain(selector);
    }
    // Reuse the three existing keyframes; do not add decorative loops.
    const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);
    expect(keyframes.sort()).toEqual(['pb-feedback-enter', 'pb-page-enter', 'pb-panel-enter']);
  });

  it('keeps the reduced-motion kill switch global', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('animation: none !important');
    expect(reduced).toContain('transition: none !important');
  });
});
