import { EditorError } from '../../../src/core/errors';

describe('EditorError', () => {
  it('carries code, detail and hint', () => {
    const e = new EditorError('ELEMENT_NOT_FOUND', '#x');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('ELEMENT_NOT_FOUND');
    expect(e.name).toBe('EditorError');
    expect(e.message).toMatch(/^\[ELEMENT_NOT_FOUND\] #x — .+/);
  });

  it('keeps the cause', () => {
    const cause = new Error('inner');
    expect(new EditorError('UPLOAD_FAILED', 'a.png', { cause }).cause).toBe(cause);
  });
});
