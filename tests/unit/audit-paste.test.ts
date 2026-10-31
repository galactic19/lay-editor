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
