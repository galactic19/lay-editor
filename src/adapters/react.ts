import { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { Editor } from '../core/Editor';
import type { CoreEditorOptions } from '../core/types';
import { createSyncedEditor, type SyncedEditor } from './shared';

export interface LayEditorProps extends Omit<CoreEditorOptions, 'element' | 'content' | 'onChange'> {
  /** Extension options keyed by extension name, e.g. { image: { maxSize: 5_000_000 } }. */
  options?: Record<string, unknown>;
  /** Controlled HTML value. */
  value?: string | null;
  /** Initial HTML when uncontrolled. */
  defaultValue?: string;
  onChange?(html: string): void;
  className?: string;
}

/** Runs `effect` when `value` changes after mount (the editor already got the initial value). */
function useUpdate<T>(value: T, effect: (value: T) => void): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else effect(value);
  }, [value]);
}

/** Options are read once on mount; `value`, `theme` and `locale` follow later prop changes. */
export const LayEditor = forwardRef<Editor | null, LayEditorProps>(function LayEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const synced = useRef<SyncedEditor | null>(null);
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;

  useLayoutEffect(() => {
    const { value, defaultValue, onChange: _onChange, className: _className, options, ...core } = props;
    synced.current = createSyncedEditor(host.current!, { ...options, ...core }, value ?? defaultValue, (html) => onChange.current?.(html));
    return () => {
      synced.current?.destroy();
      synced.current = null;
    };
  }, []);
  useImperativeHandle<Editor | null, Editor | null>(ref, () => synced.current?.editor ?? null, []);

  useEffect(() => {
    if (props.value !== undefined) synced.current?.applyValue(props.value);
  }, [props.value]);
  useUpdate(props.theme, (theme) => theme && synced.current?.editor.setTheme(theme));
  useUpdate(props.locale, (locale) => locale && synced.current?.editor.setLocale(locale));

  return createElement('div', { ref: host, className: props.className });
});
