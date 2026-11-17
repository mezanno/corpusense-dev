import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Parse every token block of src/index.css by selector and simulate the documented
// cascade order (documented in src/index.css and DECISIONS.md D-013): a theme = :root overridden by
// its `[data-palette='…']` block, itself overridden in dark mode by `[data-theme='dark']`
// (heritage) then by the combination `[data-palette='…'][data-theme='dark']`.
const css = readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const rawScales: Record<string, string> = {};
const themeBlock = css.slice(css.indexOf('@theme {'), css.indexOf(':root {'));
for (const [, token, value] of themeBlock.matchAll(
  /--([\w-]+):\s*(#[\da-f]{3}(?:[\da-f]{3})?);/gi,
)) {
  rawScales[token] = value.trim();
}

function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Missing CSS block: ${selector}`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start + selector.length, css.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const [, token, value] of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[token] = value.trim();
  }
  return tokens;
}

// Internal slugs of the standalone (off-brand) themes: lot 11's five plus the four
// added on 2026-11-17.
const paletteSlugs = [
  'foret',
  'prune',
  'cuivre',
  'encre',
  'brume',
  'ocean',
  'rose',
  'olive',
  'charbon',
];

const root = declarations(':root');
const heritageDarkOverride = declarations("[data-theme='dark']");
const paletteLightOverrides: Record<string, Record<string, string>> = Object.fromEntries(
  paletteSlugs.map((slug) => [slug, declarations(`[data-palette='${slug}']`)]),
);
const paletteDarkOverrides: Record<string, Record<string, string>> = Object.fromEntries(
  paletteSlugs.map((slug) => [slug, declarations(`[data-palette='${slug}'][data-theme='dark']`)]),
);

// `--radius` and the cursors intentionally live only in `:root` (lot 10).
const colorTokens = Object.keys(root).filter(
  (token) => token !== 'radius' && !token.startsWith('cursor-'),
);

const themes: Record<string, Record<string, string>> = {
  'heritage light': root,
  'heritage dark': { ...root, ...heritageDarkOverride },
  ...Object.fromEntries(
    paletteSlugs.map((slug) => [`${slug} light`, { ...root, ...paletteLightOverrides[slug] }]),
  ),
  ...Object.fromEntries(
    paletteSlugs.map((slug) => [
      `${slug} dark`,
      {
        ...root,
        ...heritageDarkOverride,
        ...paletteLightOverrides[slug],
        ...paletteDarkOverrides[slug],
      },
    ]),
  ),
};

const brandScales = ['saffron', 'cerulean', 'eggshell', 'dark-goldenrod', 'dark-slate-gray'];

describe('token blocks', () => {
  const blocks: Record<string, Record<string, string>> = {
    "[data-theme='dark']": heritageDarkOverride,
    ...Object.fromEntries(
      paletteSlugs.flatMap((slug) => [
        [`[data-palette='${slug}']`, paletteLightOverrides[slug]],
        [`[data-palette='${slug}'][data-theme='dark']`, paletteDarkOverrides[slug]],
      ]),
    ),
  };

  for (const [selector, block] of Object.entries(blocks)) {
    it(`every token of ${selector} is declared in :root`, () => {
      for (const token of Object.keys(block)) {
        expect(root, `Token outside :root: ${token}`).toHaveProperty(token);
      }
    });

    it(`${selector} is complete: every semantic color token is redefined`, () => {
      for (const token of colorTokens) {
        expect(block, `Missing token in ${selector}: ${token}`).toHaveProperty(token);
      }
    });
  }

  it('the standalone palette blocks carry no brand scale', () => {
    for (const slug of paletteSlugs) {
      for (const block of [paletteLightOverrides[slug], paletteDarkOverrides[slug]]) {
        for (const value of Object.values(block)) {
          for (const brand of brandScales) {
            expect(value, `Brand scale in palette '${slug}': ${value}`).not.toContain(
              `--color-${brand}`,
            );
          }
        }
      }
    }
  });
});

describe.each(Object.entries(themes))('%s theme', (_name, tokens) => {
  function color(token: string): string {
    const value = tokens[token];
    expect(value, `Missing color token: ${token}`).toBeDefined();
    const alias = value.match(/^var\(--([\w-]+)\)$/);
    if (alias) {
      const scale = rawScales[alias[1]];
      expect(scale, `Unknown scale reference: ${alias[1]}`).toBeDefined();
      return scale;
    }
    expect(value, `Unexpected color for ${token}`).toMatch(/^#[\da-f]{3}([\da-f]{3})?$/i);
    return value;
  }

  function luminance(hex: string): number {
    const digits = hex.slice(1);
    const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
    const channels = [0, 2, 4].map((index) => {
      const channel = parseInt(full.slice(index, index + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function contrast(foreground: string, background: string): number {
    const values = [luminance(color(foreground)), luminance(color(background))].sort(
      (a, b) => a - b,
    );
    return (values[1] + 0.05) / (values[0] + 0.05);
  }

  // Pairs actually rendered by the shared recipes (ui/button.tsx and ui/toggle.tsx
  // soft/confirmation/alert variants, ui/card.tsx, AddCardButton, ui/input.tsx,
  // ui/textarea.tsx, ui/select.tsx, ui/checkbox.tsx, ui/sidebar.tsx, the logger
  // panel, statusPresentation tables and the base body colors).
  const statusTexts = ['success', 'warning', 'info', 'destructive', 'muted-foreground'];
  const surfaces = ['background', 'popover'];
  const pairs: Array<[string, string]> = [
    ['foreground', 'background'],
    ['foreground', 'primary'],
    ['primary-foreground', 'primary'],
    ['foreground', 'card'],
    ['foreground', 'card-hover'],
    ['primary', 'card-foreground'],
    ['foreground-button', 'primary-foreground'],
    ['foreground-button', 'info'],
    ['warning', 'primary'],
    ['info', 'primary'],
    ['destructive', 'primary'],
    ['destructive-foreground', 'destructive'],
    ['secondary-foreground', 'secondary'],
    ['primary', 'secondary-foreground'],
    ['accent-foreground', 'accent'],
    ['popover-foreground', 'popover'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'primary'],
    ['muted-foreground', 'muted'],
    ['muted-foreground', 'popover'],
    ['sidebar-foreground', 'sidebar'],
    ['sidebar-accent-foreground', 'sidebar-accent'],
    ['log-info', 'sidebar'],
    ['log-error', 'sidebar'],
    ['log-warning', 'sidebar'],
    ['log-success', 'sidebar'],
    ...statusTexts.flatMap<[string, string]>((status) =>
      surfaces.map<[string, string]>((surface) => [status, surface]),
    ),
  ];

  for (const [foreground, background] of pairs) {
    it(`${foreground} on ${background} meets WCAG AA`, () => {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
