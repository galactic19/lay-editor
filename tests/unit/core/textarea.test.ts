import { createEditor } from '../../../src/core/createEditor';
import { typeText } from '../../helpers/editor';

describe('textarea mode', () => {
  it('hides the textarea, loads its value, syncs on submit, restores on destroy', () => {
    document.body.innerHTML = '<form><textarea name="body"><p>x</p></textarea></form>';
    const ta = document.querySelector('textarea')!;
    const ed = createEditor({ element: ta });
    expect(ta.style.display).toBe('none');
    expect(ta.nextElementSibling).toBe(ed.root);
    expect(ed.getHTML()).toBe('<p>x</p>');
    typeText(ed, 'y');
    ta.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ta.value).toBe('<p>yx</p>');
    ed.destroy();
    expect(ta.style.display).toBe('');
    expect(document.querySelector('.le-editor')).toBeNull();
  });

  it('syncs after the change debounce and on destroy', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<textarea></textarea>';
    const ta = document.querySelector('textarea')!;
    const ed = createEditor({ element: ta });
    typeText(ed, 'a');
    vi.advanceTimersByTime(300);
    expect(ta.value).toBe('<p>a</p>');
    typeText(ed, 'b');
    ed.destroy();
    expect(ta.value).toBe('<p>ab</p>');
  });

  it('prefers the content option over the textarea value', () => {
    document.body.innerHTML = '<textarea><p>x</p></textarea>';
    const ed = createEditor({ element: 'textarea', content: '<p>c</p>' });
    expect(ed.getHTML()).toBe('<p>c</p>');
    ed.destroy();
  });
});
