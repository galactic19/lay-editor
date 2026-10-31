import { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { Editor } from '../core/Editor';
import type { CoreEditorOptions } from '../core/types';
import { createSyncedEditor, localeKey, type SyncedEditor } from './shared';

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

/**
 * The mount effect: a layout effect in the browser, so the editor exists before paint. On the server effects never run,
 * and React 18 warns about every useLayoutEffect it renders there, so server rendering gets useEffect.
 */
const useMountEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Runs `effect` when `key` differs from the last applied one; the editor got the mount value,
 * and StrictMode's effect replay must not count as a change.
 */
function useUpdate<T>(key: T, effect: () => void): void {
  const applied = useRef(key);
  useEffect(() => {
    if (Object.is(applied.current, key)) return;
    applied.current = key;
    effect();
  }, [key]);
}

/** Options are read once on mount; `value`, `theme` and `locale` follow later prop changes. */
export const LayEditor = forwardRef<Editor | null, LayEditorProps>(function LayEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const synced = useRef<SyncedEditor | null>(null);
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;
  // Once controlled, an undefined value means "empty", not "leave as is".
  const controlled = useRef(props.value !== undefined);
  if (props.value !== undefined) controlled.current = true;

  useMountEffect(() => {
    const { value, defaultValue, onChange: _onChange, className: _className, options, ...core } = props;
    synced.current = createSyncedEditor(host.current!, { ...options, ...core }, value ?? defaultValue, (html) => onChange.current?.(html));
    return () => {
      synced.current?.destroy();
      synced.current = null;
    };
  }, []);
  useImperativeHandle<Editor | null, Editor | null>(ref, () => synced.current?.editor ?? null, []);

  useEffect(() => {
    if (controlled.current) synced.current?.applyValue(props.value);
  }, [props.value]);
  useUpdate(props.theme, () => props.theme && synced.current?.editor.setTheme(props.theme));
  useUpdate(localeKey(props.locale), () => props.locale && synced.current?.editor.setLocale(props.locale));

  return createElement('div', { ref: host, className: props.className });
});
