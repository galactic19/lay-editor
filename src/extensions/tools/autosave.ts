import type { Command } from 'prosemirror-state';
import type { Editor } from '../../core/Editor';
import { DEFAULTS } from '../../core/defaults';
import { EditorError } from '../../core/errors';
import { debounce, type Debounced } from '../../core/timing';
import { DraftStore, type Draft } from '../../io/autosave';
import { c } from '../../ui/classes';
import { h, onPageLeave } from '../../ui/dom';
import { UIComponent } from '../../ui/UIComponent';
import { defineExtension } from '../factories';

type AutosaveOptions = { key?: string; debounce: number };

interface Session {
  store: DraftStore;
  save: Debounced<[]>;
  /** A previous draft the user has not restored or discarded yet; saving would overwrite it. */
  pending: Draft | null;
}

const sessions = new WeakMap<Editor, Session>();

export class RestoreBar extends UIComponent<HTMLDivElement> {
  constructor(editor: Editor) {
    const t = editor.t;
    const session = sessions.get(editor);
    const resolve = (restore: boolean) => () => {
      if (!session?.pending) return;
      if (restore) editor.setHTML(session.pending.html);
      else session.store.clear();
      session.pending = null;
      this.update();
    };
    super(
      editor,
      h(
        'div',
        { class: c('restore-bar'), attrs: { role: 'status' } },
        h('span', {}, t('autosave.found')),
        h('button', { class: c('button', 'button-primary'), attrs: { type: 'button', 'data-action': 'restore' }, on: { click: resolve(true) } }, t('autosave.restore')),
        h('button', { class: c('button'), attrs: { type: 'button', 'data-action': 'discard' }, on: { click: resolve(false) } }, t('autosave.discard')),
      ),
    );
  }

  /** Shown while a previous draft waits for a decision; clearDraft() can also settle it. */
  override update(): void {
    this.el.hidden = !sessions.get(this.editor)?.pending;
  }
}

export const autosave = defineExtension<AutosaveOptions>({
  name: 'autosave',
  defaults: { debounce: DEFAULTS.autosave.debounce },
  commands: ({ editor }) => ({
    clearDraft: (): Command => (_state, dispatch) => {
      const session = sessions.get(editor);
      if (!session) return false;
      if (dispatch) {
        session.save.cancel();
        session.store.clear();
        session.pending = null;
        editor.ui?.flush();
      }
      return true;
    },
  }),
  components: ({ options }) => (options.key ? [{ slot: 'top', create: (editor) => new RestoreBar(editor) }] : []),
  onCreate: ({ editor, options }) => {
    if (!options.key) return;
    const store = new DraftStore(DEFAULTS.autosave.prefix + options.key);
    if (!store.available) {
      editor.reportError(new EditorError('STORAGE_UNAVAILABLE', options.key));
      return;
    }
    const draft = store.load();
    const save = debounce(() => {
      if (!session.pending) store.save(editor.getHTML());
    }, options.debounce);
    const session: Session = { store, save, pending: draft && draft.html && draft.html !== editor.getHTML() ? draft : null };
    sessions.set(editor, session);
    const off = editor.on('update', (tr) => {
      if (tr.docChanged) save();
    });
    // A closed tab never calls destroy(): the last edits still waiting for the debounce are saved as the page goes.
    const stopLeave = onPageLeave(() => save.flush());
    return () => {
      off();
      stopLeave();
      save.flush();
      sessions.delete(editor);
    };
  },
});
