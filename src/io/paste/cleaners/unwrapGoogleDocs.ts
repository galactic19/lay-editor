import { unwrap, withDocument } from '../dom';

const GDOCS_MARKER = /id="docs-internal-guid/;

/** Google Docs wraps the whole clipboard in a non-bold <b id="docs-internal-guid-…">. */
export function unwrapGoogleDocs(html: string): string {
  if (!GDOCS_MARKER.test(html)) return html;
  return withDocument(html, (doc) => {
    doc.body.querySelectorAll('b[id^="docs-internal-guid"]').forEach(unwrap);
  });
}
