import { DEFAULTS } from '../core/defaults';

export interface Draft {
  html: string;
  savedAt: number;
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Storage can exist and still throw (private mode, quota); probe it once. */
function usable(storage: Storage | null | undefined): storage is Storage {
  if (!storage) return false;
  try {
    storage.setItem(DEFAULTS.autosave.probeKey, '1');
    storage.removeItem(DEFAULTS.autosave.probeKey);
    return true;
  } catch {
    return false;
  }
}

/** A single draft in localStorage. Every access is guarded; failures are silent. */
export class DraftStore {
  readonly available: boolean;
  private readonly storage: Storage | null;

  constructor(
    private readonly key: string,
    storage: Storage | null | undefined = defaultStorage(),
  ) {
    this.storage = usable(storage) ? storage : null;
    this.available = this.storage !== null;
  }

  load(): Draft | null {
    try {
      const draft = JSON.parse(this.storage?.getItem(this.key) ?? 'null');
      return typeof draft?.html === 'string' && typeof draft?.savedAt === 'number' ? draft : null;
    } catch {
      return null;
    }
  }

  save(html: string): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify({ html, savedAt: Date.now() } satisfies Draft));
    } catch {
      // Quota or privacy errors: keep editing without a draft.
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // Nothing to clear.
    }
  }
}
