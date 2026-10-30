import { createEditor, type Editor } from '../src';

declare global {
  interface Window {
    __editor: Editor;
    __editor2: Editor;
  }
}

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

const SAMPLE = `
<h2>Laymaker Editor</h2>
<p>어느 프로젝트에도 붙여 쓰는 <strong>리치 텍스트 에디터</strong>입니다. <em>모바일</em>에서도 편하게 쓸 수 있습니다.</p>
<ul data-type="taskList"><li data-checked="true"><p>기본 서식</p></li><li data-checked="false"><p>미디어와 표</p></li></ul>
<blockquote><p>글자를 선택하면 서식 도구가 나타납니다.</p></blockquote>
`;

const output = $<HTMLPreElement>('#output');
const editor = createEditor({
  element: '#editor',
  content: params.has('empty') ? '' : SAMPLE,
  theme: (params.get('theme') as 'light' | 'dark' | null) ?? 'auto',
  onChange: (html) => (output.textContent = html),
});
output.textContent = editor.getHTML();
window.__editor = editor;
window.__editor2 = createEditor({ element: '#editor-2', preset: 'basic', content: '<p>basic 프리셋</p>' });

const textareaEditor = createEditor({ element: '#form textarea' });
$<HTMLFormElement>('#form').addEventListener('submit', (event) => {
  event.preventDefault();
  $<HTMLOutputElement>('#form-output').textContent = String(new FormData(event.target as HTMLFormElement).get('body'));
});
void textareaEditor;

let dark = editor.root.dataset.theme === 'dark';
$('#toggle-theme').addEventListener('click', () => {
  dark = !dark;
  editor.setTheme(dark ? 'dark' : 'light');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
});

let english = false;
$('#toggle-locale').addEventListener('click', (event) => {
  english = !english;
  editor.setLocale(english ? 'en' : 'ko');
  (event.target as HTMLButtonElement).textContent = english ? '한국어' : 'English';
});

$('#large-sample').addEventListener('click', () => {
  const paragraph = '<p>성능 확인용 문단입니다. 한글과 English가 섞인 긴 문장을 반복합니다. 0123456789.</p>';
  editor.setHTML(paragraph.repeat(Math.ceil(50000 / 60)));
});
