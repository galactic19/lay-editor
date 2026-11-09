# @laymaker/editor 사용 가이드

어느 프로젝트에도 붙여 쓰는 리치 텍스트 에디터입니다. 프레임워크 없이 동작하고, React·Vue 래퍼도 제공합니다.

## 1. 설치

### 빌드 도구가 있는 프로젝트 (Vite, webpack, Next.js 등)

```bash
npm install @laymaker/editor
```

```ts
import { createEditor } from '@laymaker/editor';
import '@laymaker/editor/style.css';

const editor = createEditor({ element: '#editor' });
```

### 빌드 도구가 없는 페이지 (PHP, JSP, 정적 HTML)

```html
<link rel="stylesheet" href="/vendor/laymaker/style.css" />
<div id="editor"></div>
<script src="/vendor/laymaker/editor.umd.js"></script>
<script>
  const editor = LayEditor.createEditor({ element: '#editor' });
</script>
```

- `dist/editor.umd.js`와 `dist/style.css`를 프로젝트에 복사하거나 CDN 주소를 씁니다.
- UMD 파일은 코드 분할을 할 수 없어서 코드블록 문법 강조(lowlight)까지 한 파일에 들어 있습니다. 크기는 gzip 약 185KB입니다. ESM 빌드는 문법 강조를 코드블록을 처음 쓸 때 따로 불러오므로 기본 용량이 약 145KB입니다.

### CommonJS, TypeScript, 테스트 환경

- 패키지는 ESM이 기본입니다. `require('@laymaker/editor')`(CommonJS, Jest 기본 설정)는 같은 UMD 빌드의 CommonJS 사본(`dist/editor.umd.cjs`)을 불러옵니다. React·Vue 래퍼는 ESM으로만 제공합니다.
- 타입 정의가 들어 있습니다. `import '@laymaker/editor/style.css'`도 따로 `*.css` 선언 없이 타입 검사를 통과하고(TypeScript 6 기본 설정 포함), `"moduleResolution": "node"`인 오래된 프로젝트에서도 `/react`·`/vue` 타입을 찾습니다.
- 앱의 jsdom 테스트(Vitest, Jest, Testing Library)에는 `matchMedia`와 `ResizeObserver`가 없습니다. 그래도 에디터는 만들어지고 데스크톱·라이트 테마로 동작하므로 따로 흉내 낼 필요가 없습니다.

## 2. textarea 모드 (기존 폼에 붙이기)

```html
<form method="post" action="/posts">
  <textarea name="body"><p>기존 내용</p></textarea>
  <button>저장</button>
</form>
<script>
  LayEditor.createEditor({ element: 'textarea[name=body]' });
</script>
```

- textarea는 숨겨지고 그 자리에 에디터가 나타납니다.
- 내용이 바뀌면 textarea 값이 자동으로 갱신되고, 폼을 전송하는 순간에도 한 번 더 동기화됩니다. `form.submit()`이나 `new FormData(form)`도 에디터에 보이는 내용을 읽습니다.
- `content` 옵션을 주면 생성 직후 그 내용이 textarea에 들어갑니다. 고치지 않고 전송해도 화면에 보이던 내용이 전송됩니다.
- 폼을 초기화(`reset`)하면 에디터도 처음 만들 때의 내용으로 돌아갑니다. 에디터가 쓰는 입력 요소(HTML 소스 보기의 입력란, 체크리스트 상자)는 폼에 속하지 않으므로, 소스 보기를 연 채 초기화해도 내용이 지워지지 않고 체크 상태도 문서와 같게 유지됩니다. textarea 모드가 아니어도, 폼 안에 에디터를 두었을 때 마찬가지입니다.
- 같은 이름(`answers[]`)의 textarea 여러 개에 각각 에디터를 붙여도, 각 에디터의 내용은 자기 textarea 자리로 전송됩니다.
- textarea에 `required`가 있으면 빈 에디터로는 전송되지 않습니다. 사용자가 전송 버튼을 누르거나 Enter로 전송하면(입력 칸의 Enter, 앱의 Ctrl+Enter 단축키) 에디터가 빨간 테두리(`le-invalid`)와 `aria-invalid`로 표시됩니다. 다른 칸이 먼저 걸리지 않았다면 포커스가 에디터로 오고, 에디터 언어로 "내용을 입력하세요" 토스트가 나옵니다(`setCustomValidity()`로 문구를 정했다면 그 문구). 내용을 고치면 표시가 사라집니다.
- 앱이 `checkValidity()`를 부르면 사용자가 페이지를 조작한 뒤에만 빨간 테두리가 생기고, 포커스와 토스트는 없습니다. 그래서 저장 버튼 상태를 정하려고 로드할 때나 입력할 때마다 불러도 됩니다. 전송 버튼도 Enter도 아닌 곳에서 `requestSubmit()`을 부를 때(예: `type="button"` 버튼의 클릭 처리)도 같습니다.
- 서버 코드는 바꿀 필요가 없습니다. `body` 필드로 HTML이 그대로 전송됩니다.

## 3. 옵션

### 기본 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `element` | `string \| HTMLElement` | (필수) | 선택자, 요소, 또는 `<textarea>` |
| `content` | `string` | `''` | 초기 HTML. textarea 모드에서 생략하면 textarea 값을 씁니다 |
| `preset` | `'basic' \| 'full'` | `'full'` | 툴바 구성 |
| `toolbar` | `string[]` | — | 툴바 항목 ID 배열. `'|'`는 구분선. 주면 `preset`을 덮어씁니다 |
| `locale` | `'ko' \| 'en' \| 객체` | `'ko'` | UI 언어 |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | `auto`는 OS 설정을 따릅니다 |
| `placeholder` | `string` | 언어팩 문구 | 빈 문서 안내 문구 |
| `upload` | `(file, { onProgress }) => Promise<{ url, alt? }>` | — | 이미지 업로드 함수. 없으면 URL로만 이미지를 넣습니다 |
| `changeDebounce` | `number` (ms) | `300` | `onChange` 호출 간격 |
| `extensions` | `Extension[]` | `[]` | 사용자 확장 |
| `disable` | `string[]` | `[]` | 끌 기본 확장 이름 (예: `['table', 'codeHighlight']`) |
| `onChange` | `(html) => void` | — | 내용이 바뀐 뒤 호출 |
| `onReady` | `(editor) => void` | — | 생성 직후 호출 |

### 확장별 옵션 (확장 이름을 키로 넘깁니다)

```ts
createEditor({
  element: '#editor',
  image: { maxSize: 5 * 1024 * 1024, accept: ['image/png', 'image/jpeg'] },
  video: { providers: ['youtube'] },
  codeBlock: { languages: ['plaintext', 'javascript', 'python'] },
  colors: { text: ['#000000', '#e03131'], highlight: ['#ffec99'] },
  table: { maxGrid: 8, defaultRows: 2, defaultCols: 2 },
  autosave: { key: 'post-123' },
});
```

| 키 | 필드 | 기본값 |
|---|---|---|
| `image` | `maxSize`, `accept`, `widths`, `aligns` | 10MB, png/jpeg/gif/webp, `[25, 50, 75, 100]`, `['left','center','right']` |
| `video` | `providers` | `['youtube', 'vimeo']` (동영상 패널의 안내 문구도 이 목록의 서비스 이름을 씀) |
| `codeBlock` | `languages`, `indent`, `exitBlankLines` | 10개 언어, 공백 2칸, 빈 줄 2개(끝의 빈 줄이 이만큼일 때 Enter로 블록을 나감, `0`처럼 양의 정수가 아니면 끔). ```` ```js ````·`language-py`처럼 줄인 이름은 언어 메뉴에서 `javascript`·`python` 항목으로 표시되고, 저장되는 클래스는 그대로입니다 |
| `colors` | `text`, `highlight` | 각 10색 |
| `table` | `maxGrid`, `mobileMaxGrid`, `defaultRows`, `defaultCols`, `cellColors` | 10, 6, 3, 3, 배경색 팔레트 |
| `autosave` | `key`, `debounce` | 없음(꺼짐), 1000ms (페이지를 닫거나 숨길 때는 기다리지 않고 바로 저장) |

- 옵션 타입이 틀리면(예: `image: { maxSize: '5MB' }`, `onChange: 'save'`) 에디터를 만들 때 `INVALID_OPTION` 오류가 납니다. 확장 옵션은 기본값과 같은 형태(숫자, 목록, 객체)여야 하고(`NaN`은 숫자로 보지 않습니다), 목록의 각 항목은 기본값 목록에 있는 종류 중 하나여야 합니다. `content`, `upload`, `onChange`, `onReady`에 `null`을 주면 지정하지 않은 것으로 봅니다.
- `element`는 같은 페이지의 요소여야 합니다. iframe 안의 요소에 붙이려면 iframe 페이지에서 에디터를 불러오세요.

## 4. 이미지 업로드

```ts
createEditor({
  element: '#editor',
  upload: async (file, { onProgress }) => {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/upload', { method: 'POST', body });
    if (!response.ok) throw new Error(`upload failed: ${response.status}`);
    onProgress(1);
    return response.json(); // { url: 'https://cdn.example.com/a.png' }
  },
});
```

- 파일 선택, 드래그 앤 드롭, 붙여넣기(스크린샷 포함) 모두 이 함수를 거칩니다.
- 붙여넣거나 끌어 놓은 HTML 안의 `data:` 이미지도 이 함수로 올립니다. 문서에 원래 있던 `data:` 이미지는 건드리지 않습니다.
- 여러 파일은 고른 순서대로 들어갑니다.
- 캡션에는 글자만 들어갑니다. 캡션에 커서가 있을 때 넣거나 붙여넣은 이미지와 여러 문단은 그 이미지 바로 뒤에 들어갑니다.
- 캡션에서 Enter(Shift+Enter, Ctrl+Enter도)를 누르면 캡션은 그대로 두고 이미지 다음 새 문단으로 갑니다. 문서 끝의 이미지 뒤에도 이렇게 이어 쓸 수 있습니다.
- 동영상을 넣으면 커서는 동영상 다음 문단으로 갑니다(문서 끝이면 새 문단). 바로 이어 써도 동영상이 지워지지 않습니다.
- 업로드 중에는 미리보기와 진행 막대가 보이고, `getHTML()` 결과에서는 빠집니다.
- 실패하면 미리보기가 사라지고 토스트 알림과 `uploadError` 이벤트가 발생합니다.
- 서버가 돌려준 URL도 검사합니다. `javascript:` 같은 주소는 거부됩니다.

## 5. 메서드와 이벤트

```ts
editor.getHTML();             // 정제된 HTML. 빈 문서면 ''
editor.setHTML('<p>새 내용</p>'); // 새 문서를 불러온 것으로 보고 실행 취소 기록을 비웁니다
editor.getText();
editor.isEmpty();
editor.exec('toggleBold');    // 명령 실행 → 성공 여부
editor.can('undo');           // 실행 가능 여부
editor.isActive('heading', { level: 2 });
editor.focus();
editor.setEditable(false);    // 읽기 전용. 켜 둔 전체 화면·HTML 소스 보기를 끄는 버튼은 계속 쓸 수 있음
editor.setTheme('dark');      // 현재 값은 editor.theme
editor.setLocale('en');       // UI를 다시 만들어도 setTheme 값은 유지
editor.clearDraft();          // 저장이 끝난 뒤 임시저장 삭제
editor.destroy();
```

| 이벤트 | 인자 | 시점 |
|---|---|---|
| `change` | `html` | 내용이 바뀐 뒤 (디바운스) |
| `update` | `transaction` | 모든 편집마다 |
| `selectionChange` | — | 선택 영역 변경 |
| `focus`, `blur` | — | 포커스 변화 |
| `uploadStart` | `file` | 업로드 시작 |
| `uploadProgress` | `file`, `ratio`(0~1) | 업로드 진행 |
| `uploadSuccess` | `file`, `url` | 업로드 성공 |
| `uploadError` | `file`, `EditorError` | 업로드 실패(`UPLOAD_FAILED`) 또는 형식·용량 검사 탈락(`UPLOAD_REJECTED`) |
| `modeChange` | `'desktop' \| 'mobile'` | 기기 모드 전환 |
| `error` | `EditorError` | 잡힌 내부 오류 (코드: `error.code`) |
| `destroy` | — | 해제 직전 |

```ts
const off = editor.on('change', (html) => save(html));
off(); // 구독 해제
```

- HTML 소스 보기에서 고친 내용은 일반 편집처럼 실행 취소할 수 있습니다. 소스 보기를 열고 닫을 때마다 실행 취소 단계가 나뉩니다.
- 읽기 전용에서 Esc도 전체 화면을 끕니다. 모바일에서는 키보드 위 툴바에 전체 화면·소스 보기 끄기 버튼만 남습니다.

주요 명령 이름: `toggleBold`, `toggleItalic`, `toggleUnderline`, `toggleStrike`, `toggleCode`, `setTextColor(color)`, `setHighlight(color)`, `setLink({ href, newTab })`, `unsetLink`, `setHeading(level)`, `setParagraph`, `toggleBlockquote`, `toggleBulletList`, `toggleOrderedList`, `toggleTaskList`, `setAlign(value)`, `indent`, `outdent`, `insertHorizontalRule`, `insertImage({ src, alt })`, `insertVideo(url)`, `insertTable(rows, cols)`, `mergeCells`, `splitCell`, `toggleHeaderRow`(첫 행을 머리글로 켜고 끔), `toggleCodeBlock`, `setFindQuery(text)`, `replaceAll(text)`, `toggleFullscreen`, `toggleSourceView`, `undo`, `redo`.

## 6. 저장한 내용 보여주기 (보기 페이지)

```html
<link rel="stylesheet" href="/vendor/laymaker/content.css" />
<div class="le-prose"><!-- 저장한 HTML --></div>
```

- `content.css`는 에디터 화면과 같은 모양으로 본문을 보여줍니다. 에디터 UI 스타일은 들어 있지 않습니다.
- 연속된 공백과 줄 앞뒤의 공백은 `&nbsp;`와 번갈아 저장됩니다(예: `a &nbsp; &nbsp;b`). 그래서 다시 불러와도, 보기 페이지에서도 입력한 공백이 그대로 보입니다. 다시 불러올 때는 이런 `&nbsp;`를 일반 공백으로 되돌리므로, 끝에 남긴 공백 뒤에 이어 쓴 단어도 찾기에 걸립니다. 단어 사이에 홀로 있는 `&nbsp;`(예: `10&nbsp;km`)는 그대로 둡니다.
- 붙여넣은 `&nbsp;` 연속도 같은 규칙으로 저장됩니다. 그래서 저장한 HTML을 다시 불러와도 `getHTML()` 결과가 같고, 자동 임시저장이 같은 내용을 복원하라고 묻지 않습니다.
- 붙여넣은 일반 텍스트의 탭은 코드 블록 밖에서 공백 4칸으로 바뀝니다. HTML은 탭을 공백 하나로 줄여 보여 주기 때문입니다.
- 다크 모드는 `<div class="le-prose" data-theme="dark">`처럼 지정합니다. 색을 칠한 표 칸의 글자는 형광펜처럼 두 테마 모두 어두운 색입니다.
- 8장에서 테마 변수를 바꿨다면 보기 페이지의 `.le-prose`에도 같은 값을 지정하세요. 단독 `.le-prose`는 자기 기본값을 가지므로 `.le-editor`에 준 값을 물려받지 않습니다.

> **보안 주의.** 에디터는 입력과 출력을 모두 허용 목록 기준으로 정제하지만, 클라이언트 정제는 서버 정제를 대신하지 못합니다. 요청은 에디터를 거치지 않고도 만들 수 있기 때문입니다. 서버에서도 허용 목록 기반 정제를 하세요(예: DOMPurify, bleach, OWASP Java HTML Sanitizer). 브라우저에서 한 번 더 정제하려면 `sanitizeHTML(html)`을 쓸 수 있습니다. 다만 `sanitizeHTML`은 에디터 스키마(모든 기본 확장)로 해석하므로, 보기 페이지에서 불러오면 에디터 번들 대부분(gzip 약 120KB)이 함께 들어갑니다. 가벼운 보기 페이지가 필요하면 서버에서 정제한 HTML을 넣고 `content.css`만 쓰세요.

## 7. 툴바 구성

```ts
createEditor({
  element: '#editor',
  toolbar: ['undo', 'redo', '|', 'heading', 'bold', 'italic', '|', 'bulletList', 'link', 'image'],
});
```

사용할 수 있는 항목 ID:

| 분류 | ID |
|---|---|
| 기록 | `undo`, `redo` |
| 글자 | `bold`, `italic`, `underline`, `strike`, `code`, `textColor`, `highlight`, `clearFormat`, `link` |
| 문단 | `heading`, `align`, `indent`, `outdent`, `blockquote`, `horizontalRule`, `codeBlock` |
| 목록 | `bulletList`, `orderedList`, `taskList` |
| 삽입 | `image`, `video`, `table` |
| 도구 | `findReplace`, `sourceView`, `fullscreen` |

- 없는 ID를 넣으면 콘솔에 경고와 함께 사용 가능한 ID 목록이 출력됩니다.
- 표·이미지·링크·코드블록 전용 도구는 해당 요소를 선택했을 때 자동으로 나타납니다(데스크톱은 떠 있는 툴바, 모바일은 키보드 위 툴바). 이미지는 클릭하면 선택됩니다. 키보드로는 Alt+F10으로 들어가고 Esc로 본문에 돌아옵니다.
- 표의 '머리글 행' 도구는 커서가 어느 칸에 있든 표의 첫 행을 머리글로 켜고 끕니다. 켜져 있으면 눌린 상태로 보입니다.
- 표 셀을 병합하려면 먼저 여러 칸을 선택합니다. 데스크톱은 칸 사이를 끌거나 Shift를 누른 채 누르고, 모바일은 글자 선택 핸들을 옆 칸까지 끌면 칸 단위 선택으로 바뀌고, 더 끌면 선택한 칸이 늘어납니다.

## 8. 테마

CSS 변수로 바꿉니다. `.le-editor, .le-portal`(드롭다운·바텀시트 등 바깥에 그려지는 요소), `.le-prose`(보기 페이지)에 함께 지정하세요.

```css
.le-editor, .le-portal, .le-prose {
  --le-color-primary: #7048e8;
  --le-radius: 4px;
  --le-font: 'Pretendard', sans-serif;
}
```

| 변수 | 용도 |
|---|---|
| `--le-color-bg`, `--le-color-fg`, `--le-color-muted` | 배경, 글자, 보조 글자 |
| `--le-color-primary`, `--le-color-primary-fg` | 강조색과 그 위 글자 |
| `--le-color-border`, `--le-color-surface`, `--le-color-hover`, `--le-color-active` | 테두리, 툴바 배경, 상태 배경 |
| `--le-color-danger`, `--le-color-danger-fg`, `--le-color-danger-ring`, `--le-focus-ring-width` | 오류 알림과 그 위 글자(4.5:1 이상), 필수 입력 누락 표시, 포커스 테두리 두께 |
| `--le-color-highlight-fg` | 형광펜과 색을 칠한 표 칸의 글자색. 칠하는 색이 밝은 색이라 다크 테마에서도 어두운 색을 씀. 글자색이나 링크가 있으면 그 색을 따름 |
| `--le-color-active-fg`, `--le-color-control-border` | 선택된 항목의 글자(`--le-color-active` 위 4.5:1 이상), 입력란·버튼·색상 칸 테두리(배경 대비 3:1 이상) |
| `--le-font`, `--le-font-mono`, `--le-font-size`, `--le-line-height` | 글꼴 |
| `--le-radius`, `--le-control-size`, `--le-touch-target` | 모서리, 버튼 크기, 모바일 터치 영역(44px) |
| `--le-min-height`, `--le-content-padding` | 편집 영역 크기 |
| `--le-z-sticky`, `--le-z-fullscreen`, `--le-z-overlay`, `--le-z-toast` | 쌓임 순서. 바꿀 때도 상단 툴바 < 전체화면 에디터 < 패널·바텀시트·메뉴·키보드 위 툴바 < 토스트 순서를 지키세요 |

다크 테마 값은 `[data-theme='dark']` 선택자에서 다시 정의합니다. 기본 값은 두 테마 모두 WCAG AA 대비를 지키므로, 색을 바꿀 때도 위 대비를 유지하세요.

## 9. 언어팩

```ts
import { registerLocale } from '@laymaker/editor';

registerLocale('ja', { toolbar: { bold: '太字', italic: '斜体' }, placeholder: '入力してください' });
createEditor({ element: '#editor', locale: 'ja' });
```

- 빠진 키는 영어로 대체됩니다.
- 언어 코드는 대소문자를 가리지 않고, `ko-KR`·`en-US`처럼 지역이 붙은 코드는 등록된 `ko`·`en` 팩을 씁니다.
- 등록되지 않은 코드(예: `kr`)는 콘솔 경고와 함께 기본 언어(`ko`)로 표시됩니다. `registerLocale`은 `createEditor`보다 먼저 호출하세요.
- 한 번만 쓰는 문구 수정은 `locale: { placeholder: '댓글을 입력하세요' }`처럼 객체로 넘겨도 됩니다.

## 10. React와 Vue

```tsx
import { LayEditor } from '@laymaker/editor/react';
import '@laymaker/editor/style.css';

function PostForm() {
  const [html, setHtml] = useState('<p>안녕하세요</p>');
  const editorRef = useRef<Editor>(null);
  return (
    <LayEditor
      ref={editorRef}
      value={html}
      onChange={setHtml}
      upload={uploadImage}
      options={{ image: { maxSize: 5_000_000 } }}
    />
  );
}
```

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { LayEditor } from '@laymaker/editor/vue';
import '@laymaker/editor/style.css';

const html = ref('<p>안녕하세요</p>');
</script>

<template>
  <LayEditor v-model="html" :options="{ upload: uploadImage }" theme="auto" />
</template>
```

- 옵션은 마운트할 때 한 번 읽습니다. `value`(`v-model`), `theme`, `locale`은 이후 변경도 반영됩니다.
- `locale` 객체는 내용으로 비교합니다. 인라인 객체로 넘겨도 렌더링마다 UI를 다시 만들지 않습니다.
- React는 기본 옵션을 props로, 확장 옵션을 `options`로 넘깁니다. Vue는 모든 옵션을 `options`로 넘깁니다.
- 에디터 인스턴스: React는 `ref`, Vue는 컴포넌트 ref의 `getEditor()`(타입 포함) 또는 `@ready` 이벤트(인자: 에디터). Vue에서 받은 에디터는 `markRaw`가 되어 있어 `ref()`에 넣어도 됩니다.
- 서버 렌더링(Next.js 등)에서는 빈 `div`만 그리고, 에디터는 브라우저에서 만듭니다. React 18에서도 `useLayoutEffect` 경고가 나지 않습니다.

## 11. 사용자 확장 만들기 (@멘션 예제)

```ts
import { createEditor, defineExtension, registerIcon } from '@laymaker/editor';

const mention = defineExtension({
  name: 'mention',
  nodes: {
    mention: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { id: {}, label: {} },
      parseDOM: [
        {
          tag: 'span[data-mention]',
          getAttrs: (dom) => ({ id: dom.dataset.mention, label: dom.textContent.replace(/^@/, '') }),
        },
      ],
      toDOM: (node) => ['span', { 'data-mention': node.attrs.id, class: 'mention' }, `@${node.attrs.label}`],
    },
  },
  commands: ({ schema }) => ({
    insertMention: (id, label) => (state, dispatch) => {
      dispatch?.(state.tr.replaceSelectionWith(schema.nodes.mention.create({ id, label })));
      return true;
    },
  }),
  ui: () => [
    { id: 'mention', kind: 'button', icon: 'at-sign', label: 'toolbar.mention', command: 'insertMention', args: ['u1', '민수'], contexts: ['text'] },
  ],
});

registerIcon('at-sign', '<svg viewBox="0 0 24 24">…</svg>');
createEditor({
  element: '#editor',
  extensions: [mention],
  toolbar: ['bold', 'mention'],
  locale: { toolbar: { mention: '사람 언급' } },
});
```

- UI 항목의 `label`은 언어팩 키입니다. 어느 팩에도 없으면 키 문자열(`toolbar.mention`)이 버튼 이름과 툴팁에 그대로 보이므로, 위처럼 `locale` 객체(기본 언어 팩에 덧붙음)나 `registerLocale`로 문구를 넣으세요. `registerLocale`은 팩 전체를 바꾸므로 기존 문구도 함께 넣어야 합니다.
- 전체 화면처럼 화면 모드를 바꾸는 버튼에는 `viewToggle: true`를 주세요. 켜져 있는 동안(`isActive`) 읽기 전용에서도 쓸 수 있어, 그 모드를 빠져나갈 길이 남습니다.

- 확장 하나가 스키마, 명령, 단축키(`keymap`), 입력 규칙(`inputRules`), 플러그인, UI 항목, 컴포넌트를 선언합니다.
- 글자 서식처럼 단순한 기능은 `markExtension`, 문단 단위는 `blockExtension`을 쓰면 한 번에 생성됩니다.
- 사용자 확장의 노드도 `sanitizeHTML(html, { extensions: [mention] })`로 정제할 수 있습니다.
- `registerIcon`의 SVG 문자열은 HTML 페이지에 넣은 SVG처럼 해석합니다(xmlns 생략, 닫히지 않은 태그 허용). `<svg>`가 없으면 콘솔 경고와 함께 기본 아이콘을 씁니다.

## 12. 단축키

| 동작 | Windows / Linux | Mac |
|---|---|---|
| 굵게 / 기울임 / 밑줄 | Ctrl+B / I / U | ⌘B / I / U |
| 취소선 / 인라인 코드 | Ctrl+Shift+S / Ctrl+E | ⌘⇧S / ⌘E |
| 링크 | Ctrl+K | ⌘K |
| 실행 취소 / 다시 실행 | Ctrl+Z / Ctrl+Shift+Z | ⌘Z / ⌘⇧Z |
| 본문 / 제목 1~4 | Ctrl+Alt+0~4 | ⌘⌥0~4 |
| 인용 / 코드 블록 | Ctrl+Shift+B / Ctrl+Alt+C | ⌘⇧B / ⌘⌥C |
| 글머리 / 번호 / 체크 목록 | Ctrl+Shift+8 / 7 / 9 | ⌘⇧8 / 7 / 9 |
| 들여쓰기 / 내어쓰기 | Ctrl+] / Ctrl+[ (목록 안에서는 Tab / Shift+Tab) | ⌘] / ⌘[ |
| 정렬 왼쪽 / 가운데 / 오른쪽 / 양쪽 | Ctrl+Shift+L / E / R / J | ⌘⇧L / E / R / J |
| 찾기와 바꾸기 | Ctrl+F | ⌘F |
| 줄바꿈 (문단 나누지 않음) | Shift+Enter | ⇧↩ |
| 이미지 캡션 나가기 (다음 문단으로) | Enter, Shift+Enter, Ctrl+Enter | ↩, ⇧↩, ⌘↩ |
| 표: 다음 칸 / 이전 칸 (마지막 칸에서 Tab은 행 추가) | Tab / Shift+Tab | ⇥ / ⇧⇥ |
| 코드 블록 나가기 | Ctrl+Enter, 블록 끝에서 ↓ / →, 끝의 빈 줄 두 개에서 Enter | ⌘↩, 블록 끝에서 ↓ / →, 끝의 빈 줄 두 개에서 ↩ |
| 툴바로 이동 (상황별 도구 → 서식 버블 → 메인 툴바 순으로 보이는 것) | Alt+F10 | ⌥F10 |
| 떠 있는 툴바에서 본문으로 돌아가기 | Esc | Esc |

마크다운식 입력: `# `~`#### ` 제목, `- ` 글머리 목록, `1. ` 번호 목록(`0. `처럼 다른 숫자로 시작하면 그 번호부터), `[] `·`[x] ` 체크리스트, `> ` 인용, ```` ``` ```` + 언어 + 공백 코드블록, `---` 구분선, `**굵게**`, `*기울임*`, `~~취소선~~`, `` `코드` ``, URL 뒤 공백 자동 링크, `/` 블록 삽입 메뉴.
