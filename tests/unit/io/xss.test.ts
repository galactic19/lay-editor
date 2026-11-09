import { sanitizeHTML } from '../../../src/io/sanitize';
import vectors from '../../fixtures/xss/vectors.json';

const FORBIDDEN =
  /<script|javascript:|vbscript:|\son\w+\s*=|<object|<embed|<svg|<style|<math|<form|<input|<base|<meta|srcdoc|data:text|expression\(|url\(/i;
const SAFE_IFRAME = /src="https:\/\/(www\.youtube-nocookie\.com\/embed|player\.vimeo\.com\/video)\//;

describe('XSS vectors', () => {
  it.each(vectors)('$name is neutralised', ({ input }) => {
    const out = sanitizeHTML(input);
    expect(out).not.toMatch(FORBIDDEN);
    for (const tag of out.match(/<iframe[^>]*>/g) ?? []) expect(tag).toMatch(SAFE_IFRAME);
  });

  it('keeps safe content', () => {
    expect(sanitizeHTML('<p>a<br>b</p>')).toBe('<p>a<br>b</p>');
  });
});
