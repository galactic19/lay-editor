import { makeEditor } from '../../helpers/editor';

const files = import.meta.glob('../../fixtures/roundtrip/*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const cases = Object.entries(files).flatMap(([file, text]) =>
  text.split('\n').filter((line) => line.trim()).map((line) => [file.split('/').pop()!, line] as const),
);

describe('HTML round-trip', () => {
  it.each(cases)('%s: %s', (_file, line) => {
    expect(makeEditor({ content: line }).getHTML()).toBe(line);
  });
});
