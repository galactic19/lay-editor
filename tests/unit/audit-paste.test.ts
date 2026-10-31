import { makeEditor } from '../helpers/editor';

const paste = (html: string): string => {
  const ed = makeEditor();
  ed.view.pasteHTML(html);
  return ed.getHTML();
};

describe('paste drops the source page colors (audit #23)', () => {
  it('drops near-black page text color, including link text', () => {
    const out = paste(
      '<h2 style="color: rgb(33, 37, 41);">Web title</h2><p style="color: rgb(33, 37, 41);">Body with <a href="https://example.com/">a link</a> end.</p>',
    );
    expect(out).toBe('<h2>Web title</h2><p>Body with <a href="https://example.com/">a link</a> end.</p>');
  });

  it("drops the editor's own viewer text color (#1f2328)", () => {
    expect(paste('<p style="color: rgb(31, 35, 40);">before</p><p style="color:#1f2328">after</p>')).toBe('<p>before</p><p>after</p>');
  });

  it('drops light grey dark-theme text but keeps chromatic syntax colors', () => {
    const out = paste(
      '<div style="color: #cccccc;background-color: #1f1f1f;"><div><span style="color: #569cd6;">const</span><span style="color: #cccccc;"> a</span></div></div>',
    );
    expect(out).toBe('<p><span style="color: rgb(86, 156, 214);">const</span> a</p>');
  });

  it('drops near-white and near-black page backgrounds instead of making highlights', () => {
    expect(paste('<p><span style="background-color: rgb(248, 248, 248);">light</span></p>')).toBe('<p>light</p>');
    expect(paste('<p><span style="background-color: rgb(13, 17, 23); color: rgb(230, 237, 243);">dark</span></p>')).toBe('<p>dark</p>');
  });

  it('keeps intentional chromatic colors, mid-grey highlights and grey cell shading', () => {
    expect(paste('<p><span style="color:#c00000">red</span> <span style="background-color:#c0c0c0">grey</span></p>')).toBe(
      '<p><span style="color: rgb(192, 0, 0);">red</span> <mark style="background-color: rgb(192, 192, 192);">grey</mark></p>',
    );
    expect(paste('<table><tbody><tr><td style="background-color:#d9d9d9">h</td></tr></tbody></table>')).toBe(
      '<table><tbody><tr><td style="background-color: rgb(217, 217, 217);"><p>h</p></td></tr></tbody></table>',
    );
  });

  it('reads short hex and translucent rgba greys', () => {
    expect(paste('<p style="color: rgba(0, 0, 0, 0.87)">material</p><p style="color:#333">short</p>')).toBe('<p>material</p><p>short</p>');
  });

  it('keeps every color on internal clipboard HTML', () => {
    expect(paste('<p data-pm-slice="1 1 []"><span style="color: rgb(73, 80, 87);">grey</span></p>')).toBe(
      '<p><span style="color: rgb(73, 80, 87);">grey</span></p>',
    );
  });
});

/** Wraps a fragment the way Word puts it on the clipboard. */
const word = (body: string): string =>
  `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment-->${body}<!--EndFragment--></body></html>`;

describe('Word colors, highlights and cell shading (audit #24)', () => {
  it('keeps named font colors and highlights written as the background shorthand', () => {
    const out = paste(
      word(
        "<p class=MsoNormal><span style='color:red'>빨강</span><span style='color:yellow'>노랑</span><span style='background:lime;mso-highlight:lime'>연두</span><o:p></o:p></p>",
      ),
    );
    expect(out).toBe(
      '<p><span style="color: rgb(255, 0, 0);">빨강</span><span style="color: rgb(255, 255, 0);">노랑</span><mark style="background-color: rgb(0, 255, 0);">연두</mark></p>',
    );
  });

  it('keeps table cell shading written as the background shorthand', () => {
    const out = paste(
      word(
        "<table class=MsoTableGrid><tr><td width=301 valign=top style='width:225.4pt;border:solid windowtext 1.0pt;background:#FFC000;padding:0cm 5.4pt 0cm 5.4pt'><p class=MsoNormal><b>헤더1</b></p></td></tr></table>",
      ),
    );
    expect(out).toBe('<table><tbody><tr><td style="background-color: rgb(255, 192, 0);"><p><strong>헤더1</strong></p></td></tr></tbody></table>');
  });

  it('reads a plain-color background shorthand from any source', () => {
    expect(paste('<p><span style="background: #ffec99">hl</span></p>')).toBe('<p><mark style="background-color: rgb(255, 236, 153);">hl</mark></p>');
  });

  it('drops shorthands and keywords that are not a plain color', () => {
    expect(paste('<p><span style="background: url(x.png) no-repeat">a</span><span style="color: windowtext">b</span><span style="color: black">c</span></p>')).toBe(
      '<p>abc</p>',
    );
  });
});

describe('pasted code blocks keep their language (audit #25)', () => {
  it('keeps the language class, as setHTML does', () => {
    expect(paste('<pre><code class="language-js">const a = 1;</code></pre>')).toBe('<pre><code class="language-js">const a = 1;</code></pre>');
  });

  it('keeps only the language token from highlighter markup', () => {
    expect(paste('<pre class="language-ts"><code class="hljs language-ts">let x: number</code></pre>')).toBe(
      '<pre><code class="language-ts">let x: number</code></pre>',
    );
  });

  it('drops classes that do not name a safe language', () => {
    expect(paste('<pre><code class="hljs language-this-name-is-far-too-long-to-be-real">x</code></pre><p class="language-js">p</p>')).toBe(
      '<pre><code>x</code></pre><p>p</p>',
    );
  });
});
