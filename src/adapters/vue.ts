import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch, type PropType } from 'vue';
import type { Editor } from '../core/Editor';
import type { LocaleInput, ThemeMode } from '../core/types';
import { createSyncedEditor, localeKey, type AdapterOptions, type SyncedEditor } from './shared';

/** `v-model` HTML editor. Options are read on mount; `theme` and `locale` follow later changes. */
export const LayEditor = defineComponent({
  name: 'LayEditor',
  props: {
    modelValue: { type: String as PropType<string | null>, default: undefined },
    options: { type: Object as PropType<AdapterOptions>, default: () => ({}) },
    theme: { type: String as PropType<ThemeMode>, default: undefined },
    locale: { type: [String, Object] as PropType<LocaleInput>, default: undefined },
  },
  emits: {
    'update:modelValue': (html: string) => typeof html === 'string',
    ready: (editor: Editor) => Boolean(editor),
  },
  setup(props, { emit }) {
    const host = ref<HTMLDivElement | null>(null);
    const synced = shallowRef<SyncedEditor | null>(null);

    onMounted(() => {
      const options: AdapterOptions = { ...props.options };
      if (props.theme) options.theme = props.theme;
      if (props.locale) options.locale = props.locale;
      synced.value = createSyncedEditor(host.value!, options, props.modelValue, (html) => emit('update:modelValue', html));
      emit('ready', synced.value.editor);
    });
    watch(
      () => props.modelValue,
      (value) => synced.value?.applyValue(value),
    );
    watch(
      () => props.theme,
      (theme) => theme && synced.value?.editor.setTheme(theme),
    );
    watch(
      () => localeKey(props.locale),
      () => props.locale && synced.value?.editor.setLocale(props.locale),
    );
    onBeforeUnmount(() => {
      synced.value?.destroy();
      synced.value = null;
    });

    // Returned bindings (not `expose()`) make up the instance type, so a template ref typed
    // from LayEditor knows getEditor(). `host` is the root element, i.e. what `$el` already is.
    return { host, getEditor: (): Editor | null => synced.value?.editor ?? null };
  },
  render() {
    return h('div', { ref: 'host' });
  },
});
