import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { LayEditor } from '../../../src/adapters/vue';
import type { Editor } from '../../../src/core/Editor';
import { typeText } from '../../helpers/editor';

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function mount(initial: string | null) {
  const model = ref<string | null>(initial);
  const component = ref<{ getEditor(): Editor | null } | null>(null);
  const ready = vi.fn();
  const App = defineComponent({
    setup: () => () =>
      h(LayEditor, {
        ref: component,
        modelValue: model.value,
        'onUpdate:modelValue': (html: string) => (model.value = html),
        onReady: ready,
        options: { changeDebounce: 0 },
        theme: 'light',
      }),
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(App);
  app.mount(host);
  return { model, component, ready, app };
}

describe('Vue LayEditor', () => {
  it('supports v-model and exposes the editor', async () => {
    const { model, component, ready, app } = mount('<p>a</p>');
    const editor = component.value!.getEditor()!;
    expect(ready).toHaveBeenCalledWith(editor);
    expect(editor.getHTML()).toBe('<p>a</p>');
    typeText(editor, 'x');
    await settle();
    expect(model.value).toBe('<p>xa</p>');
    model.value = '<p>b</p>';
    await nextTick();
    expect(editor.getHTML()).toBe('<p>b</p>');
    app.unmount();
    expect(document.querySelector('.le-editor')).toBeNull();
  });

  it('treats a null model as empty', () => {
    expect(mount(null).component.value!.getEditor()!.getHTML()).toBe('');
  });
});
