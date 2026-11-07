import { filterStyle, removeComments, withDocument } from '../dom';

const HWP_MARKER = /class="?HStyle\d|함초롬|HwpEditor/i;
const DROPPED = /^(font-family|line-height|letter-spacing|margin(-\w+)?|text-indent)$/;

/** Removes the Hangul word processor's paragraph classes and layout styles. */
export function cleanHwp(html: string): string {
  if (!HWP_MARKER.test(html)) return html;
  return withDocument(html, (doc) => {
    removeComments(doc.body);
    doc.body.querySelectorAll('[class]').forEach((el) => el.removeAttribute('class'));
    doc.body.querySelectorAll<HTMLElement>('[style]').forEach((el) => filterStyle(el, (prop) => !DROPPED.test(prop)));
  });
}
