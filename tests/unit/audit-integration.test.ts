import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { LayEditor as ReactLayEditor, type LayEditorProps } from '../../src/adapters/react';
import { LayEditor as VueLayEditor } from '../../src/adapters/vue';
import type { Editor } from '../../src/core/Editor';
import type { LocaleInput, ThemeMode } from '../../src/core/types';
import { makeEditor } from '../helpers/editor';
import { setMedia } from '../setup';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountReact(props: LayEditorProps) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const ref = createRef<Editor | null>();
  const root = createRoot(host);
  act(() => root.render(createElement(ReactLayEditor, { ...props, ref })));
  const rerender = (next: LayEditorProps) => act(() => root.render(createElement(ReactLayEditor, { ...next, ref })));
  return { editor: () => ref.current!, rerender, unmount: () => act(() => root.unmount()) };
}

function mountVue(initial: { theme?: ThemeMode; locale?: LocaleInput }) {
  const props = ref(initial);
  const component = ref<{ getEditor(): Editor | null } | null>(null);
  const App = defineComponent({ setup: () => () => h(VueLayEditor, { ref: component, ...props.value }) });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(App);
  app.mount(host);
  return { props, editor: () => component.value!.getEditor()!, unmount: () => app.unmount() };
}

describe('setLocale keeps the runtime theme (#3, #63)', () => {
  it('core: setTheme survives setLocale', () => {
    const ed = makeEditor({ theme: 'light' });
    ed.setTheme('dark');
    ed.setLocale('en');
    expect(ed.root.dataset.theme).toBe('dark');
    ed.setTheme('light');
    ed.setLocale('ko');
    expect(ed.root.dataset.theme).toBe('light');
  });

  it('mobile: the visible keyboard bar follows setTheme() and the OS scheme right away', () => {
    setMedia('(pointer: coarse)', true);
    const ed = makeEditor({ theme: 'auto' });
    ed.focus();
    ed.ui!.flush();
    const bar = document.querySelector<HTMLElement>('.le-mobile-bar')!;
    expect([bar.hidden, bar.dataset.theme]).toEqual([false, 'light']);
    setMedia('(prefers-color-scheme: dark)', true);
    expect(bar.dataset.theme).toBe('dark');
    ed.setTheme('light');
    expect(bar.dataset.theme).toBe('light');
  });

  it('React: a locale prop change keeps the current theme prop', () => {
    const { editor, rerender, unmount } = mountReact({ theme: 'light', locale: 'ko' });
    rerender({ theme: 'dark', locale: 'ko' });
    rerender({ theme: 'dark', locale: 'en' });
    expect(editor().root.dataset.theme).toBe('dark');
    unmount();
  });

  it('Vue: a locale prop change keeps the current theme prop', async () => {
    const { props, editor, unmount } = mountVue({ theme: 'light', locale: 'ko' });
    props.value = { theme: 'dark', locale: 'ko' };
    await nextTick();
    props.value = { theme: 'dark', locale: 'en' };
    await nextTick();
    expect(editor().root.dataset.theme).toBe('dark');
    unmount();
  });
});
