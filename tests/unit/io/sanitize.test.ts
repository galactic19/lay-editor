import { clampWidth, oneOf, safeColor, safeLanguage, safeUrl } from '../../../src/io/sanitize';

describe('safeUrl', () => {
  it.each(['https://a.com', 'http://a.com', 'mailto:a@b.c', 'tel:010', '/a', 'a.html', '#x', '?q=1'])('keeps %s', (v) => {
    expect(safeUrl(v)).toBe(v);
  });

  it.each(['javascript:alert(1)', ' javascript:alert(1)', 'java\tscript:x', 'JaVaScRiPt:x', 'vbscript:x', 'data:text/html,x', 'data:image/png;base64,AAA', '', null, undefined])(
    'rejects %s',
    (v) => {
      expect(safeUrl(v)).toBeNull();
    },
  );

  it('trims surrounding whitespace', () => {
    expect(safeUrl('  https://a.com  ')).toBe('https://a.com');
  });

  it('allows data images only when asked, and only image types', () => {
    expect(safeUrl('data:image/png;base64,AAA', { allowDataImage: true })).toBe('data:image/png;base64,AAA');
    expect(safeUrl('data:image/svg+xml;base64,AAA', { allowDataImage: true })).toBeNull();
  });
});

describe('safeColor', () => {
  it.each([
    ['#fff', '#fff'],
    ['#E03131', '#e03131'],
    ['rgb(1, 2, 3)', 'rgb(1,2,3)'],
    ['rgba(1,2,3,0.5)', 'rgba(1,2,3,0.5)'],
  ])('%s → %s', (input, out) => {
    expect(safeColor(input)).toBe(out);
  });

  it.each(['red', 'url(x)', 'expression(alert(1))', 'rgb(300,0,0)', '#ggg', 'rgba(1,2,3,2)', '', null])('rejects %s', (v) => {
    expect(safeColor(v)).toBeNull();
  });
});

describe('clampWidth', () => {
  it.each([
    ['50%', 50],
    ['5%', 10],
    ['150%', 100],
    [50, 50],
    ['50px', null],
    ['abc', null],
    [null, null],
  ])('%s → %s', (input, out) => {
    expect(clampWidth(input as string | number | null)).toBe(out);
  });
});

describe('safeLanguage / oneOf', () => {
  it('validates language names', () => {
    expect(safeLanguage('c++')).toBe('c++');
    expect(safeLanguage('js" onclick="x')).toBeNull();
  });

  it('oneOf returns the value only if allowed', () => {
    expect(oneOf('center', ['center', 'right'] as const)).toBe('center');
    expect(oneOf('evil', ['center'] as const)).toBeNull();
    expect(oneOf(3, ['center'] as const)).toBeNull();
  });
});
