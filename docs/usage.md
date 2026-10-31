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
- UMD 파일은 코드 분할을 할 수 없어서 코드블록 문법 강조(lowlight)까지 한 파일에 들어 있습니다. 크기는 gzip 약 175KB입니다. ESM 빌드는 문법 강조를 코드블록을 처음 쓸 때 따로 불러오므로 기본 용량이 약 135KB입니다.

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
- 폼을 초기화(`reset`)하면 에디터도 처음 만들 때의 내용으로 돌아갑니다.
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
| `video` | `providers` | `['youtube', 'vimeo']` |
| `codeBlock` | `languages`, `indent` | 10개 언어, 공백 2칸 |
| `colors` | `text`, `highlight` | 각 10색 |
| `table` | `maxGrid`, `mobileMaxGrid`, `defaultRows`, `defaultCols`, `cellColors` | 10, 6, 3, 3, 배경색 팔레트 |
| `autosave` | `key`, `debounce` | 없음(꺼짐), 1000ms |

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
editor.setEditable(false);    // 읽기 전용
editor.setTheme('dark');
editor.setLocale('en');
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

주요 명령 이름: `toggleBold`, `toggleItalic`, `toggleUnderline`, `toggleStrike`, `toggleCode`, `setTextColor(color)`, `setHighlight(color)`, `setLink({ href, newTab })`, `unsetLink`, `setHeading(level)`, `setParagraph`, `toggleBlockquote`, `toggleBulletList`, `toggleOrderedList`, `toggleTaskList`, `setAlign(value)`, `indent`, `outdent`, `insertHorizontalRule`, `insertImage({ src, alt })`, `insertVideo(url)`, `insertTable(rows, cols)`, `mergeCells`, `splitCell`, `toggleCodeBlock`, `setFindQuery(text)`, `replaceAll(text)`, `toggleFullscreen`, `toggleSourceView`, `undo`, `redo`.

## 6. 저장한 내용 보여주기 (보기 페이지)

```html
<link rel="stylesheet" href="/vendor/laymaker/content.css" />
<div class="le-prose"><!-- 저장한 HTML --></div>
```

- `content.css`는 에디터 화면과 같은 모양으로 본문을 보여줍니다. 에디터 UI 스타일은 들어 있지 않습니다.
- 다크 모드는 `<div class="le-prose" data-theme="dark">`처럼 지정합니다.

> **보안 주의.** 에디터는 입력과 출력을 모두 허용 목록 기준으로 정제하지만, 클라이언트 정제는 서버 정제를 대신하지 못합니다. 요청은 에디터를 거치지 않고도 만들 수 있기 때문입니다. 서버에서도 허용 목록 기반 정제를 하세요(예: DOMPurify, bleach, OWASP Java HTML Sanitizer). 브라우저에서 한 번 더 정제하려면 `sanitizeHTML(html)`을 쓸 수 있습니다.

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
- 표·이미지·링크·코드블록 전용 도구는 해당 요소를 선택했을 때 자동으로 나타납니다(데스크톱은 떠 있는 툴바, 모바일은 키보드 위 툴바).

## 8. 테마

CSS 변수로 바꿉니다. `.le-editor, .le-portal`(드롭다운·바텀시트 등 바깥에 그려지는 요소)에 함께 지정하세요.

```css
.le-editor, .le-portal {
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
| `--le-font`, `--le-font-mono`, `--le-font-size`, `--le-line-height` | 글꼴 |
| `--le-radius`, `--le-control-size`, `--le-touch-target` | 모서리, 버튼 크기, 모바일 터치 영역(44px) |
| `--le-min-height`, `--le-content-padding` | 편집 영역 크기 |

다크 테마 값은 `[data-theme='dark']` 선택자에서 다시 정의합니다.

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
- React는 기본 옵션을 props로, 확장 옵션을 `options`로 넘깁니다. Vue는 모든 옵션을 `options`로 넘깁니다.
- 에디터 인스턴스: React는 `ref`, Vue는 컴포넌트 ref의 `getEditor()`.

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
createEditor({ element: '#editor', extensions: [mention], toolbar: ['bold', 'mention'] });
```

- 확장 하나가 스키마, 명령, 단축키(`keymap`), 입력 규칙(`inputRules`), 플러그인, UI 항목, 컴포넌트를 선언합니다.
- 글자 서식처럼 단순한 기능은 `markExtension`, 문단 단위는 `blockExtension`을 쓰면 한 번에 생성됩니다.
- 사용자 확장의 노드도 `sanitizeHTML(html, { extensions: [mention] })`로 정제할 수 있습니다.

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

마크다운식 입력: `# `~`#### ` 제목, `- ` 글머리 목록, `1. ` 번호 목록, `[] `·`[x] ` 체크리스트, `> ` 인용, ```` ``` ```` + 언어 + 공백 코드블록, `---` 구분선, `**굵게**`, `*기울임*`, `~~취소선~~`, `` `코드` ``, URL 뒤 공백 자동 링크, `/` 블록 삽입 메뉴.
