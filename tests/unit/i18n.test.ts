import { createTranslator, flattenKeys, registerLocale } from '../../src/i18n';
import { ko } from '../../src/i18n/ko';
import { en } from '../../src/i18n/en';

describe('i18n', () => {
  it('translates and interpolates', () => {
    registerLocale('zz', { hi: '안녕 {name}' });
    expect(createTranslator('zz')('hi', { name: '민' })).toBe('안녕 민');
  });

  it('falls back to en, then to the key', () => {
    registerLocale('zz', { hi: '안녕' });
    const t = createTranslator('zz');
    expect(t('toolbar.more')).toBe('More');
    expect(t('no.such.key')).toBe('no.such.key');
  });

  it('merges a partial custom pack over the default language', () => {
    const t = createTranslator({ toolbar: { more: '…' } });
    expect(t('toolbar.more')).toBe('…');
    expect(t('placeholder')).toBe('내용을 입력하세요');
  });

  it('uses ko by code', () => {
    expect(createTranslator('ko')('placeholder')).toBe('내용을 입력하세요');
  });

  it('leaves unknown params untouched', () => {
    registerLocale('zz', { hi: '{a} {b}' });
    expect(createTranslator('zz')('hi', { a: 1 })).toBe('1 {b}');
  });

  it('ko defines every key en defines', () => {
    expect(flattenKeys(ko).sort()).toEqual(flattenKeys(en).sort());
  });
});
