import { mountReact } from '../../helpers/adapters';
import { typeText } from '../../helpers/editor';

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('React LayEditor', () => {
  it('mounts, emits onChange, applies value changes without echo, destroys on unmount', async () => {
    const onChange = vi.fn();
    const { ref, rerender, unmount } = mountReact({ value: '<p>a</p>', onChange, changeDebounce: 0 });
    const editor = ref.current!;
    expect(editor.getHTML()).toBe('<p>a</p>');
    typeText(editor, 'x');
    await settle();
    expect(onChange).toHaveBeenLastCalledWith('<p>xa</p>');
    rerender({ value: '<p>b</p>', onChange, changeDebounce: 0 });
    expect(editor.getHTML()).toBe('<p>b</p>');
    const setHTML = vi.spyOn(editor, 'setHTML');
    rerender({ value: '<p>b</p>', onChange, changeDebounce: 0 });
    expect(setHTML).not.toHaveBeenCalled();
    unmount();
    expect(document.querySelector('.le-editor')).toBeNull();
  });

  it('does not push its own echo back into the editor', async () => {
    const onChange = vi.fn();
    const { ref, rerender } = mountReact({ value: '', onChange, changeDebounce: 0 });
    typeText(ref.current!, 'y');
    await settle();
    const setHTML = vi.spyOn(ref.current!, 'setHTML');
    rerender({ value: '<p>y</p>', onChange, changeDebounce: 0 });
    expect(setHTML).not.toHaveBeenCalled();
  });

  it('treats value null/undefined as empty and uses defaultValue', () => {
    expect(mountReact({ value: null }).ref.current!.getHTML()).toBe('');
    expect(mountReact({ defaultValue: '<p>d</p>' }).ref.current!.getHTML()).toBe('<p>d</p>');
  });

  it('applies theme changes and passes options through', () => {
    const { ref, rerender } = mountReact({ theme: 'light', preset: 'basic', className: 'host' });
    expect(ref.current!.root.dataset.theme).toBe('light');
    expect(document.querySelector('.host .le-editor')).not.toBeNull();
    rerender({ theme: 'dark', preset: 'basic' });
    expect(ref.current!.root.dataset.theme).toBe('dark');
  });
});
