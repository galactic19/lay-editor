import { parseVideoUrl, registerVideoProvider } from '../../../src/extensions/media/video-providers';
import { makeEditor } from '../../helpers/editor';

const ALL = ['youtube', 'vimeo'];

describe('parseVideoUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'youtube', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://vimeo.com/76979871', 'vimeo', '76979871'],
    ['https://player.vimeo.com/video/76979871', 'vimeo', '76979871'],
  ])('parses %s', (url, provider, id) => {
    expect(parseVideoUrl(url, ALL)).toEqual({ provider, id });
  });

  it.each(['https://evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'javascript:alert(1)', 'not a url', 'https://vimeo.com/abc'])(
    'rejects %s',
    (url) => {
      expect(parseVideoUrl(url, ALL)).toBeNull();
    },
  );

  it('respects the allowed provider list', () => {
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ', ['vimeo'])).toBeNull();
  });

  it('accepts custom providers', () => {
    registerVideoProvider({
      id: 'demo',
      title: 'Demo',
      idPattern: /^\d+$/,
      match: (url) => (url.hostname === 'video.example.com' ? url.pathname.slice(1) : null),
      embedUrl: (id) => `https://video.example.com/embed/${id}`,
    });
    expect(parseVideoUrl('https://video.example.com/42', ['demo'])).toEqual({ provider: 'demo', id: '42' });
  });
});

describe('video node', () => {
  it('insertVideo respects video.providers', () => {
    const ed = makeEditor({ video: { providers: ['vimeo'] } });
    expect(ed.exec('insertVideo', 'https://youtu.be/dQw4w9WgXcQ')).toBe(false);
    expect(ed.exec('insertVideo', 'https://vimeo.com/76979871')).toBe(true);
    expect(ed.getHTML()).toContain('src="https://player.vimeo.com/video/76979871"');
  });

  it('auto-embeds a pasted lone URL in an empty paragraph', () => {
    const ed = makeEditor();
    ed.view.pasteText('https://youtu.be/dQw4w9WgXcQ');
    expect(ed.getHTML()).toContain('data-provider="youtube"');
  });

  it('keeps a pasted URL as text inside a sentence', () => {
    const ed = makeEditor({ content: '<p>see </p>' });
    ed.view.dispatch(ed.state.tr.setSelection(ed.state.selection.constructor.atEnd(ed.state.doc) as never));
    ed.view.pasteText('https://youtu.be/dQw4w9WgXcQ');
    expect(ed.getHTML()).not.toContain('data-video');
  });

  it('parses provider iframes and drops unknown ones', () => {
    expect(makeEditor({ content: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>' }).getHTML()).toContain('data-id="dQw4w9WgXcQ"');
    expect(makeEditor({ content: '<iframe src="https://evil.com/x"></iframe>' }).getHTML()).toBe('');
    expect(makeEditor({ content: '<div data-video data-provider="youtube" data-id="x&quot; onload=&quot;a"></div>' }).getHTML()).toBe('');
  });

  it('video panel inserts from a URL', () => {
    const ed = makeEditor();
    ed.ui!.openPanelFor('video');
    const input = document.querySelector<HTMLInputElement>('.le-dropdown input[type="url"]')!;
    input.value = 'https://vimeo.com/76979871';
    input.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ed.getHTML()).toContain('data-provider="vimeo"');
  });
});
