import { nextTick, ref } from 'vue';
import { mountVue } from '../../helpers/adapters';
import { typeText } from '../../helpers/editor';

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function mount(initial: string | null) {
  const model = ref<string | null>(initial);
  const ready = vi.fn();
  const mounted = mountVue(() => ({
    modelValue: model.value,
    'onUpdate:modelValue': (html: string) => (model.value = html),
    onReady: ready,
    options: { changeDebounce: 0 },
    theme: 'light',
  }));
  return { model, ready, ...mounted };
}

describe('Vue LayEditor', () => {
  it('supports v-model and exposes the editor', async () => {
    const { model, editor: getEditor, ready, unmount } = mount('<p>a</p>');
    const editor = getEditor();
    expect(ready).toHaveBeenCalledWith(editor);
    expect(editor.getHTML()).toBe('<p>a</p>');
    typeText(editor, 'x');
    await settle();
    expect(model.value).toBe('<p>xa</p>');
    model.value = '<p>b</p>';
    await nextTick();
    expect(editor.getHTML()).toBe('<p>b</p>');
    unmount();
    expect(document.querySelector('.le-editor')).toBeNull();
  });

  it('treats a null model as empty', () => {
    expect(mount(null).editor().getHTML()).toBe('');
  });
});
