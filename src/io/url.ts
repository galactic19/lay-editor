const HAS_SCHEME = /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|tel:)/i;
const RELATIVE = /^[/#?.]/;
/** "naver.com", "www.a.com/x", "localhost:3000" — a host typed without a scheme. */
const BARE_HOST = /^(?:www\.|[\w-]+(?:\.[\w-]+)+(?=[:/?#]|$)|[\w.-]+:\d+)/i;

/** Adds the https:// people leave out of a host ("naver.com/a"); relative and other values come back trimmed. */
export function completeScheme(input: string): string {
  const value = String(input ?? '').trim();
  if (HAS_SCHEME.test(value) || RELATIVE.test(value)) return value;
  return BARE_HOST.test(value) ? `https://${value}` : value;
}
