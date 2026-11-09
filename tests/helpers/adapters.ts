import { act, createElement, createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp, defineComponent, h, ref } from 'vue';
import { LayEditor as ReactLayEditor, type LayEditorProps } from '../../src/adapters/react';
import { LayEditor as VueLayEditor } from '../../src/adapters/vue';
import type { Editor } from '../../src/core/Editor';

// Tells React that act() is in use, so it flushes updates synchronously without warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The Vue wrapper's public props, as a parent passes them to `h()` (listeners included). */
export type VueLayEditorProps = InstanceType<typeof VueLayEditor>['$props'];

/** A fresh element in the body for a framework app; the shared afterEach clears the body. */
function mountPoint(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

/** Renders the React wrapper with a ref; `strict` wraps it in StrictMode. */
export function mountReact(props: LayEditorProps, { strict = false } = {}) {
  const ref = createRef<Editor | null>();
  const root = createRoot(mountPoint());
  const rerender = (next: LayEditorProps): void => {
    const element = createElement(ReactLayEditor, { ...next, ref });
    act(() => root.render(strict ? createElement(StrictMode, null, element) : element));
  };
  rerender(props);
  return { ref, rerender, unmount: () => act(() => root.unmount()) };
}

/** Renders the Vue wrapper; `props` runs inside the render function, so reactive reads in it re-render. */
export function mountVue(props: () => VueLayEditorProps = () => ({})) {
  // Typed from the component itself, as vue-tsc types `useTemplateRef` (#53).
  const component = ref<InstanceType<typeof VueLayEditor> | null>(null);
  const app = createApp(defineComponent({ setup: () => () => h(VueLayEditor, { ref: component, ...props() }) }));
  app.mount(mountPoint());
  return { component, editor: () => component.value!.getEditor()!, unmount: () => app.unmount() };
}
