import type { LocalePack } from './index';

export const ko = {
  placeholder: '내용을 입력하세요',
  toolbar: {
    heading: '제목',
    blockquote: '인용',
    bulletList: '글머리 기호 목록',
    orderedList: '번호 목록',
    taskList: '체크리스트',
    horizontalRule: '구분선',
    align: '정렬',
    indent: '들여쓰기',
    outdent: '내어쓰기',
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
  option: {
    heading: { paragraph: '본문', h1: '제목 1', h2: '제목 2', h3: '제목 3', h4: '제목 4' },
    align: { left: '왼쪽 정렬', center: '가운데 정렬', right: '오른쪽 정렬', justify: '양쪽 정렬' },
  },
  panel: {
    color: { reset: '기본색' },
    link: { url: '링크 주소', newTab: '새 탭에서 열기', apply: '적용', remove: '링크 제거' },
  },
  a11y: {
    taskCheckbox: '할 일 완료 표시',
    toolbar: '서식 도구',
  },
} satisfies LocalePack;
