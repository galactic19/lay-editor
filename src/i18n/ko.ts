import type { LocalePack } from './index';

export const ko = {
  placeholder: '내용을 입력하세요',
  toolbar: {
    bold: '굵게',
    italic: '기울임',
    underline: '밑줄',
    strike: '취소선',
    code: '인라인 코드',
    textColor: '글자색',
    highlight: '배경색',
    link: '링크',
    clearFormat: '서식 지우기',
    undo: '실행 취소',
    redo: '다시 실행',
    more: '더보기',
  },
  panel: {
    color: { reset: '기본색' },
    link: { url: '링크 주소', newTab: '새 탭에서 열기', apply: '적용', remove: '링크 제거' },
  },
  a11y: {
    toolbar: '서식 도구',
  },
} satisfies LocalePack;
