# @laymaker/editor 설계 스펙

- 작성일: 2026-10-30
- 상태: 리뷰 대기

## 1. 목적

어느 프로젝트에서든 한 줄로 불러 쓰는 고기능 리치 텍스트 에디터를 만든다. 기능 수준은 CKEditor급이고, 모바일과 일반 사용자에게 친화적이어야 한다.

### 1.1 사용자가 정한 것

- CKEditor 수준의 고기능
- 프레임워크와 무관하게 어떤 프로젝트에도 붙일 수 있는 범용성
- 모바일 친화
- 일반 사용자 친화

### 1.2 합의한 전제

- 저장 형식은 HTML 문자열이다. DB에 저장하고 다른 페이지에서 그대로 렌더링한다.
- 이미지 업로드 서버는 프로젝트마다 다르다. 그래서 업로드 함수를 설정으로 주입받는다.
- 한글 IME 입력 안정성은 필수다.
- 상용 라이선스 없이 직접 소유하는 코드여야 한다. 의존성은 MIT 또는 ISC 라이선스만 쓴다.
- 코드 원칙
  - 클래스 또는 함수 단위로 작성하고 DRY를 지킨다.
  - 하드코딩하지 않는다. 툴바, 단축키, 수치, 문구는 모두 설정, 레지스트리, 언어팩으로 처리한다.
- UI 문구는 한국어와 영어를 내장하고, 언어팩으로 확장할 수 있다.
- 라이트/다크 테마를 지원하고, CSS 변수로 커스터마이즈한다.
- 보기 전용 CSS(`content.css`)를 별도로 제공한다.
- 입력과 출력 모두 XSS 정제가 기본 동작이다.

### 1.3 성공 기준

1. 빌드 도구가 있는 프로젝트는 `import` 한 줄, 없는 프로젝트는 `<script>` 한 줄을 넣고 `createEditor({ element })`를 호출하면 동작한다.
2. 4장의 v1 기능이 데스크톱(Chrome, Edge, Firefox, Safari)과 모바일(iOS Safari, Android Chrome)에서 모두 동작한다.
3. 한글 조합 입력에서 글자 깨짐, 중복 입력, 커서 튐이 없다. E2E 테스트와 실기기 체크리스트로 확인한다.
4. `tests/fixtures/xss/`에 있는 XSS 공격 문자열이 전부 차단된다.
5. 정규형 HTML 샘플에서 `setHTML(x)` 후 `getHTML()`의 결과가 `x`와 같다.
6. 코어 번들(UI 포함, 문법 강조 제외)이 gzip 150KB 이하다.
7. `<textarea>` 모드에서 기존 `<form>` 전송 코드를 수정하지 않아도 값이 전송된다.

## 2. 범위

### 2.1 v1에 포함

- 기본 서식
- 미디어
- 표
- 편의 기능

상세 목록은 4장에 있다.

### 2.2 v1에서 제외 (향후 확장 지점만 열어 둔다)

- 실시간 공동편집, 댓글, 변경 추적: 서버(WebSocket)와 충돌 해결 로직이 필요해서 별도 프로젝트로 다룬다.
- 마크다운 문서 붙여넣기 시 자동 변환
- 이미지 본문 감싸기(float) 배치
- 외부 URL 이미지를 우리 서버로 다시 업로드하는 기능

## 3. 아키텍처

### 3.1 엔진

ProseMirror(MIT)를 문서 엔진으로 쓴다. 엔진이 담당하는 것은 다음과 같다.

- 문서 모델과 트랜잭션
- 한글 IME 처리
- 실행취소
- 붙여넣기 파싱
- 표 셀 병합

그 위의 플러그인 구조, UI, 모바일 UX, 업로드, 테마, 언어팩은 전부 자체 코드로 만든다. Tiptap 같은 중간 래퍼는 쓰지 않는다.

### 3.2 의존성 (전부 MIT 또는 ISC)

| 패키지 | 용도 |
|---|---|
| `prosemirror-model`, `-state`, `-view`, `-transform` | 문서 엔진 |
| `prosemirror-commands`, `-keymap`, `-history`, `-inputrules` | 기본 명령, 단축키, 실행취소, 입력 규칙 |
| `prosemirror-schema-list` | 목록 명령 |
| `prosemirror-tables` | 표 편집, 셀 병합, 열 너비 조절 |
| `prosemirror-dropcursor`, `-gapcursor` | 드래그 위치 표시, 블록 사이 커서 |
| `@floating-ui/dom` | 드롭다운과 떠 있는 툴바의 위치 계산 |
| `lowlight` | 코드블록 문법 강조. 처음 사용할 때 지연 로딩한다 |
| `lucide` | 아이콘. 실제로 쓰는 것만 번들에 포함한다 |

React와 Vue는 선택적 `peerDependencies`로 둔다.

### 3.3 패키지와 진입점

패키지는 `@laymaker/editor` 하나로 하고, 진입점을 여러 개 둔다.

| 가져오는 경로 | 내용 | 형식 |
|---|---|---|
| `@laymaker/editor` | 코어 (프레임워크 무관) | ESM, UMD |
| `@laymaker/editor/react` | React 래퍼 | ESM |
| `@laymaker/editor/vue` | Vue 래퍼 | ESM |
| `@laymaker/editor/style.css` | 편집기 UI와 테마 스타일 | CSS |
| `@laymaker/editor/content.css` | 보기 전용 본문 스타일 | CSS |

- ko와 en 언어팩은 코어에 내장한다. 다른 언어는 `registerLocale` 또는 `locale` 옵션에 객체로 넘긴다.

- UMD 빌드는 전역 변수 `LayEditor`로 노출한다.
- 빌드는 Vite 라이브러리 모드와 TypeScript로 하고, 타입 정의 파일(`.d.ts`)을 함께 생성한다.

### 3.4 폴더 구조

```
laymaker-editor/
  src/
    index.ts                 공개 API 재노출
    core/
      createEditor.ts        진입 함수, 설정 검증과 병합
      Editor.ts              Editor 클래스 (exec, can, isActive, getHTML, setHTML, destroy)
      ExtensionManager.ts    확장을 모아 스키마, 플러그인, 명령, UI 항목을 조립
      EventEmitter.ts        타입이 지정된 이벤트 버스
      defaults.ts            모든 기본 수치와 설정의 단일 출처
      errors.ts              EditorError (code 포함)
      types.ts               공개 타입
    extensions/
      factories.ts           defineExtension, markExtension, blockExtension
      base/                  doc, paragraph, text, hardBreak, history, placeholder 등
      marks/                 bold, italic, underline, strike, code, link, textColor, highlight
      blocks/                heading, blockquote, lists, horizontalRule, codeBlock, align, indent
      media/                 image, video
      table/                 table
      tools/                 slashMenu, findReplace, wordCount, sourceView, fullscreen, autosave, clearFormat
    ui/
      UIComponent.ts         UI 공통 부모 클래스
      dom.ts                 DOM 생성 도우미 h(tag, attrs, children)
      device.ts              데스크톱/모바일 모드 판단, visualViewport 추적
      presets.ts             basic, full 프리셋 (항목 ID 배열)
      icons.ts               아이콘 레지스트리 (교체 가능)
      Toolbar.ts             메인 툴바 (데스크톱 상단, 모바일 키보드 위)
      ContextToolbar.ts      표나 이미지 근처의 상황별 툴바 (데스크톱)
      BubbleMenu.ts          텍스트 선택 시 메뉴 (데스크톱)
      SlashMenu.ts           / 메뉴
      PanelHost.ts           openPanel(): 드롭다운 또는 바텀시트 선택
      Dropdown.ts, BottomSheet.ts
      panels/                색상표, 링크 입력, 표 크기 선택, 이미지 옵션, 찾기/바꾸기, HTML 소스
      Toast.ts, StatusBar.ts
    io/
      html.ts                HTML과 문서 사이 변환
      sanitize.ts            속성 허용 목록, URL 검사, sanitizeHTML()
      paste/
        pipeline.ts          정리 함수 레지스트리와 실행기
        cleaners/            cleanWord, cleanHwp, unwrapGoogleDocs, normalizeStyles
      upload.ts              업로드 흐름 (검사, 미리보기, 교체, 실패 처리)
      autosave.ts            localStorage 임시저장
    i18n/
      index.ts               t(), 언어 병합, 대체 규칙
      ko.ts, en.ts
    themes/
      tokens.css             CSS 변수 (라이트, 다크)
      editor.css             UI 스타일
      content.css            본문 스타일 (편집 화면과 보기 페이지 공용)
    adapters/
      react.tsx
      vue.ts
  demo/index.html            전체 기능 데모. E2E 테스트도 이 페이지에서 실행
  tests/
    unit/
    e2e/
    fixtures/                붙여넣기 샘플(Word, 한글, 구글 문서), XSS 문자열, 왕복 HTML
  docs/
    usage.md                 설치와 사용법
    device-checklist.md      실기기 수동 체크리스트
```

## 4. v1 기능 목록

툴바 설정에 쓰는 항목 ID를 괄호에 적는다.

### 4.1 기본 서식

- 글자 서식: 굵게(`bold`), 기울임(`italic`), 밑줄(`underline`), 취소선(`strike`), 인라인 코드(`code`)
- 제목: H1~H4(`heading`). 드롭다운으로 본문과 제목 1~4 중 고른다.
- 색상: 글자색(`textColor`), 배경색(`highlight`). 팔레트는 `defaults.ts`에 두고 설정으로 바꿀 수 있다.
- 정렬: 왼쪽, 가운데, 오른쪽, 양쪽(`align`)
- 들여쓰기와 내어쓰기(`indent`, `outdent`). 목록 안에서는 목록 단계를 바꾼다.
- 목록: 글머리(`bulletList`), 번호(`orderedList`), 체크리스트(`taskList`)
- 인용(`blockquote`), 수평선(`horizontalRule`)
- 링크(`link`)
  - 단축키 `Mod-k`
  - 새 탭 열기 옵션이 있고, 새 탭일 때 `rel="noopener noreferrer"`를 자동으로 붙인다.
  - 입력한 URL은 자동으로 링크가 된다.
- 실행취소와 다시실행(`undo`, `redo`)
- 서식 지우기(`clearFormat`)
- 붙여넣기 정리 (자동 동작이라 툴바 항목이 없다)

### 4.2 미디어

- 이미지(`image`)
  - 넣는 방법: 버튼, 드래그 앤 드롭, 붙여넣기
  - 크기 조절
    - 데스크톱은 모서리 핸들을 드래그한다.
    - 모바일은 25%, 50%, 75%, 100% 버튼으로 고른다.
    - 크기는 `%` 단위로 저장해서 반응형으로 보이게 한다.
  - 캡션(`<figcaption>`)과 대체 텍스트(alt)를 넣을 수 있다.
  - 정렬은 왼쪽, 가운데, 오른쪽이다. 본문 감싸기는 하지 않는다.
- 동영상(`video`)
  - YouTube와 Vimeo URL을 받는다. 허용 도메인은 설정으로 추가할 수 있다.
  - URL만 있는 줄을 붙여넣으면 자동으로 임베드로 바뀐다.

### 4.3 표

- 삽입(`table`): 격자를 눌러 크기를 고른다. 모바일에서는 격자 칸을 터치 영역 크기 이상으로 키운다.
- 행과 열 추가, 삭제
- 셀 병합과 분할
- 셀 배경색
- 머리글 행 켜기/끄기
- 열 너비 조절: 데스크톱에서 드래그한다.

### 4.4 편의 기능

- 마크다운식 단축 입력: `# `, `## `, `- `, `1. `, `[] `, `> `, `` ``` ``, `---`, `**굵게**`, `` `코드` ``
- 슬래시 메뉴(`/`): 블록 삽입 항목을 한글과 영어 키워드로 검색한다.
- 코드블록(`codeBlock`)
  - 언어를 골라 문법을 강조한다.
  - `lowlight`는 지연 로딩한다.
  - 지원 언어 목록은 설정으로 정한다.
- 찾기와 바꾸기(`findReplace`)
  - 에디터에 포커스가 있을 때 `Mod-f`로 연다.
  - 대소문자 구분 옵션이 있다.
- 글자 수(`wordCount`)
  - 하단 상태 표시줄에 공백 포함 글자 수, 공백 제외 글자 수, 단어 수를 보여준다.
  - 글자 단위는 `Intl.Segmenter`로 센다. 한글과 이모지를 1글자로 세기 위해서다.
- HTML 소스 보기와 편집(`sourceView`): 적용할 때 정제를 거친다.
- 전체화면(`fullscreen`): `Esc`로 나간다.
- 자동 임시저장(`autosave`)
  - `autosave: { key }`를 설정하면 켜진다.
  - 다시 열면 복원할지 묻는다.
  - 저장이 끝나면 `editor.clearDraft()`로 임시본을 지운다.
- 빈 문서 안내 문구(placeholder)

### 4.5 프리셋

`ui/presets.ts`에 항목 ID 배열로 정의한다.

- `basic`: `bold`, `italic`, `underline`, `strike`, `|`, `heading`, `bulletList`, `orderedList`, `|`, `link`, `image`, `|`, `undo`, `redo`
- `full`: 4.1~4.4의 모든 항목

## 5. 공개 API

### 5.1 생성

```ts
import { createEditor } from '@laymaker/editor';
import '@laymaker/editor/style.css';

const editor = createEditor({
  element: '#editor',                 // 선택자, HTMLElement, HTMLTextAreaElement
  content: '<p>초기 내용</p>',          // textarea 모드에서는 생략하면 textarea 값을 쓴다
  preset: 'full',                     // 'basic' | 'full'
  toolbar: undefined,                 // 항목 ID 배열을 주면 preset을 덮어쓴다. '|'는 구분선
  locale: 'ko',                       // 'ko' | 'en' | 언어팩 객체
  theme: 'auto',                      // 'light' | 'dark' | 'auto'
  placeholder: undefined,             // 생략하면 언어팩 기본 문구를 쓴다
  upload: async (file, { onProgress }) => ({ url }),
  image: { maxSize, accept },         // 기본값은 defaults.ts
  video: { allowedHosts },
  codeBlock: { languages },
  colors: { text, highlight },        // 팔레트
  autosave: { key, debounce },
  changeDebounce: undefined,          // 생략하면 defaults.ts 값
  extensions: [],                     // 사용자 확장 추가
  disable: [],                        // 기본 확장 중 끌 것의 이름
  onChange: (html) => {},
  onReady: (editor) => {},
});
```

### 5.2 인스턴스 메서드

| 메서드 | 설명 |
|---|---|
| `getHTML()` | 정제된 HTML 문자열 |
| `setHTML(html)` | 정제 후 내용 교체 |
| `getText()` | 순수 텍스트 |
| `isEmpty()` | 빈 문서 여부 |
| `exec(name, ...args)` | 명령 실행, 성공 여부 반환 |
| `can(name, ...args)` | 실행 가능 여부 |
| `isActive(name, attrs?)` | 현재 선택에 서식이나 노드가 적용됐는지 |
| `focus()`, `blur()` | 포커스 제어 |
| `setEditable(bool)` | 읽기 전용 전환 |
| `setTheme(theme)`, `setLocale(locale)` | 런타임 전환 |
| `clearDraft()` | 임시저장 삭제 |
| `on(event, fn)`, `off(event, fn)` | 이벤트 구독, 해제 |
| `destroy()` | DOM, 이벤트, 옵저버 정리. textarea 모드에서는 textarea를 원상복구 |

### 5.3 이벤트

| 이벤트 | 시점 |
|---|---|
| `update` | 트랜잭션마다 (UI 갱신용) |
| `change` | 내용이 바뀐 뒤 디바운스 후. 인자는 HTML |
| `selectionChange` | 선택 영역 변경 |
| `focus`, `blur` | 포커스 변화 |
| `uploadStart`, `uploadProgress`, `uploadSuccess`, `uploadError` | 업로드 단계별 |
| `error` | 잡힌 내부 오류 |
| `destroy` | 해제 직전 |

### 5.4 기타 내보내기

- `sanitizeHTML(html)`: 보기 페이지에서 쓰는 브라우저용 정제 함수. 에디터 스키마로 파싱한 뒤 직렬화한다.
- `defineExtension`, `markExtension`, `blockExtension`: 사용자 확장 작성용
- `registerIcon(name, svg)`, `registerLocale(code, pack)`
- 타입: `EditorOptions`, `Extension`, `UIItem`, `EditorEvents`

### 5.5 프레임워크 래퍼

- React
  - `<LayEditor value={html} onChange={setHtml} options={...} />`
  - `ref`로 `editor` 인스턴스에 접근한다.
- Vue
  - `<LayEditor v-model="html" :options="..." />`
- 공통 규칙
  - `value`가 마지막으로 내보낸 HTML과 다를 때만 `setHTML`을 호출한다. 커서가 튀는 것을 막기 위해서다.
  - 언마운트 시 `destroy()`를 호출한다.

## 6. 확장 시스템

### 6.1 Extension 인터페이스

```ts
interface Extension<Options = unknown> {
  name: string;
  defaults?: Options;
  dependencies?: string[];
  nodes?: Record<string, NodeSpec>;
  marks?: Record<string, MarkSpec>;
  commands?: (ctx: ExtensionContext<Options>) => Record<string, CommandFactory>;
  keymap?: (ctx: ExtensionContext<Options>) => Record<string, string | Command>;
  inputRules?: (ctx: ExtensionContext<Options>) => InputRule[];
  plugins?: (ctx: ExtensionContext<Options>) => Plugin[];
  nodeViews?: (ctx: ExtensionContext<Options>) => Record<string, NodeViewConstructor>;
  pasteCleaners?: PasteCleaner[];
  ui?: (ctx: ExtensionContext<Options>) => UIItem[];
}

interface ExtensionContext<Options> {
  editor: Editor;
  options: Options;        // defaults + 사용자 설정 병합 결과
  schema: Schema;          // 스키마 조립 후 제공
  t: Translate;
}
```

### 6.2 UIItem (툴바와 메뉴 항목은 데이터다)

```ts
interface UIItem {
  id: string;                         // 툴바 설정에서 쓰는 ID
  kind: 'button' | 'dropdown' | 'panel';
  icon: IconName;
  label: I18nKey;
  command?: string;
  args?: unknown[];
  shortcut?: string;                  // 툴팁 표시용 (keymap과 같은 값 참조)
  contexts: UIContext[];              // 'text' | 'table' | 'image' | 'link' | 'codeBlock'
  isActive?: (editor: Editor) => boolean;
  isEnabled?: (editor: Editor) => boolean;
  options?: UIItem[];                 // dropdown 하위 항목
  panel?: PanelFactory;               // panel 종류일 때 내용 생성
  slash?: { keywords: string[] };     // 있으면 슬래시 메뉴에도 노출
}
```

### 6.3 팩토리

반복되는 구조는 팩토리로 생성한다.

- `markExtension({ name, tags, shortcut, icon, inputRule, attrs? })`
  - 다음을 한 번에 생성한다: 마크 스키마, `toggle{Name}` 명령, 단축키, 툴바 항목, 입력 규칙
  - 사용처: bold, italic, underline, strike, code
- `blockExtension({ name, tag, attrs?, shortcut?, icon, inputRule?, slash? })`
  - 다음을 생성한다: 노드 스키마, `set{Name}`과 `toggle{Name}` 명령, 단축키, 툴바와 슬래시 항목
  - 사용처: heading, blockquote, codeBlock
- `defineExtension({...})`
  - 위 틀에 맞지 않는 확장에 쓴다.
  - 사용처: image, video, table, link, textColor 등
- 세 팩토리 모두 `extend` 필드를 받는다. 생성된 확장에 `plugins`, `nodeViews` 같은 필드를 더 병합할 때 쓴다.
  - 예: codeBlock은 `blockExtension`으로 만들고, 문법 강조 플러그인은 `extend.plugins`로 더한다.

### 6.4 조립 순서 (ExtensionManager)

1. 기본 확장 목록에서 `disable`에 적힌 것을 빼고, 사용자 확장을 더한다.
2. `dependencies`로 정렬한다.
   - 누락된 의존성이 있으면 `EditorError('MISSING_DEPENDENCY')`를 던진다.
   - 이름이 중복되면 `EditorError('DUPLICATE_EXTENSION')`를 던진다.
3. 각 확장의 `defaults`와 사용자 옵션을 병합한다.
4. `nodes`와 `marks`를 합쳐 `Schema`를 만든다. 이름이 충돌하면 `EditorError('SCHEMA_CONFLICT')`를 던진다.
5. `commands`, `keymap`, `inputRules`, `plugins`, `nodeViews`, `pasteCleaners`, `ui`를 수집한다.
   - 확장 하나가 여기서 예외를 던지면 그 확장만 제외한다.
   - 제외한 확장은 `error` 이벤트와 콘솔 경고로 알린다.
6. 툴바 설정의 항목 ID를 UI 레지스트리에서 찾는다. 없는 ID는 사용 가능한 ID 목록과 함께 경고하고 건너뛴다.

### 6.5 편집 1회의 데이터 흐름

1. 입력하면 ProseMirror 트랜잭션이 생기고 새 `EditorState`가 만들어진다.
2. `EditorView`가 DOM을 갱신하고, `update` 이벤트가 나간다.
3. UI 컴포넌트가 활성·비활성 상태를 다시 계산한다. 계산은 `requestAnimationFrame`으로 프레임당 1회로 묶는다.
4. 문서가 바뀐 경우에만 디바운스 후 `change(html)` 이벤트와 `onChange`를 호출한다.
5. textarea 모드에서는 4번과 같은 시점에 textarea 값을 갱신한다. form `submit` 직전에도 즉시 한 번 더 동기화한다.

## 7. UI

### 7.1 기기 모드

- `ui/device.ts`가 모드를 판단한다.
  - `(pointer: coarse)`이면서 컨테이너 폭이 `defaults.mobileBreakpoint` 이하면 `mobile`, 그 외에는 `desktop`이다.
  - 모드가 바뀌면 UI를 다시 배치한다.
- 모바일 툴바 위치
  - `visualViewport`의 `resize`와 `scroll`을 구독한다.
  - 툴바를 화면에 보이는 영역의 바닥, 즉 키보드 바로 위에 고정한다.

### 7.2 컴포넌트별 동작

| 컴포넌트 | 데스크톱 | 모바일 |
|---|---|---|
| 메인 툴바 | 상단 sticky. `ResizeObserver`로 넘치는 항목을 `⋯` 드롭다운으로 이동 | 키보드 위 고정 1줄, 가로 스크롤(scroll-snap) |
| 상황별 도구 | `ContextToolbar`가 표나 이미지 근처에 표시 | 메인 툴바 항목이 현재 상황(`contexts`)의 항목으로 교체 |
| 세부 옵션 패널 | `Dropdown` | `BottomSheet` |
| 버블 메뉴 | 텍스트 선택 시 표시 | 사용 안 함 (OS 선택 메뉴와 겹침) |
| 슬래시 메뉴 | 커서 아래 목록 | 동일, 항목 높이는 터치 영역 이상 |
| 상태 표시줄 | 하단 (글자 수) | 동일 |

### 7.3 패널은 한 번만 작성

- 색상표, 링크 입력, 표 크기 선택, 이미지 옵션 같은 패널 내용은 `PanelFactory` 하나로 만든다.
- `PanelHost.openPanel(factory)`가 기기 모드에 따라 그 내용을 `Dropdown`이나 `BottomSheet`에 담는다.

### 7.4 현재 상황(context) 판단

선택 영역을 보고 아래 순서로 판단한다.

1. 이미지 노드가 선택됨 → `image`
2. 표 안 → `table`
3. 코드블록 안 → `codeBlock`
4. 링크 위 → `link`
5. 그 외 → `text`

툴바는 `contexts`에 현재 상황이 포함된 항목만 보여준다.

### 7.5 테마

- `themes/tokens.css`에 CSS 변수를 정의한다.
  - 색상: `--le-color-bg`, `--le-color-fg`, `--le-color-primary`, `--le-color-border`, `--le-color-muted` 등
  - 그 외: `--le-radius`, `--le-font`, `--le-toolbar-height`, `--le-touch-target`
- 컨테이너의 `data-theme="light|dark"`로 전환한다.
- `auto`는 `prefers-color-scheme`을 따르고, OS 설정이 바뀌면 즉시 반영한다.
- 모든 클래스에 `le-` 접두어를 붙인다.
- Shadow DOM은 쓰지 않는다. Safari의 선택 영역 문제와 `content.css` 공유 문제 때문이다.
- 두 테마 모두 WCAG AA 대비 기준을 충족한다.

### 7.6 언어

- `t(key, params?)`로 문구를 가져온다.
- 찾는 순서: 지정 언어 → `en` → 키 이름
- 사용자 언어팩은 기본 팩 위에 깊은 병합한다.

### 7.7 사용성과 접근성

- 툴팁에 레이블과 단축키를 같이 보여준다. Mac은 ⌘, 그 외는 Ctrl로 표기한다.
- 툴바는 `role="toolbar"`이고 roving tabindex를 쓴다.
  - 화살표 키로 항목을 이동한다.
  - 토글 버튼에는 `aria-pressed`를 단다.
  - 레이블은 언어팩에서 가져온다.
- 패널과 바텀시트
  - 열리면 포커스를 안으로 옮기고, `Esc`나 바깥 탭으로 닫는다.
  - 닫히면 에디터로 포커스를 돌려준다.
- 모바일에서 버튼 터치 영역은 `--le-touch-target`(기본 44px) 이상이다.
- 토스트는 `role="status"`로 스크린리더에 알린다.

## 8. 입출력

### 8.1 HTML 출력

스키마의 `toDOM`으로 직렬화한다. 대표적인 출력 형태는 다음과 같다.

- 문단과 제목: `<p>`, `<h1>`~`<h4>`
- 정렬: `style="text-align:center"`
- 들여쓰기: `data-indent="1"`. 이 값의 표시는 `content.css`가 담당한다.
- 글자 서식: `<strong>`, `<em>`, `<u>`, `<s>`, `<code>`
- 색상: `<span style="color:#hex">`, `<mark style="background-color:#hex">`
- 목록: `<ul>`, `<ol>`, `<ul data-type="taskList"><li data-checked="true">`
- 이미지: `<figure data-align="center"><img src alt style="width:50%"><figcaption>`
- 동영상: `<div data-video data-provider="youtube" data-id="…"><iframe src="(우리 코드가 만든 URL)" allowfullscreen></iframe></div>`
- 표: `<table><tbody><tr><th|td colspan rowspan style="background-color:#hex">`
- 코드블록: `<pre><code class="language-js">`

### 8.2 HTML 입력과 정제 (`io/sanitize.ts`)

- 1차 방어: `DOMParser`로 파싱한 뒤 스키마의 `parseDOM` 규칙에 맞는 것만 문서로 들어온다. 스키마에 없는 태그는 버리고, 그 안의 텍스트만 남긴다.
- 2차 방어: 노드와 마크별로 허용하는 속성만 읽는다. 각 `parseDOM`의 `getAttrs`에서 검증한다.
  - URL(`href`, `src`)
    - 허용: `http:`, `https:`, `mailto:`, `tel:`, 상대 경로
    - 이미지에 한해 `data:image/*`도 허용한다. 단, 이 경우는 8.4의 업로드 대상이 된다.
    - 그 외는 버린다.
  - 색상: `#rgb`, `#rrggbb`, `rgb()`, `rgba()`만 허용한다.
  - 너비: `%` 숫자만 허용하고, `defaults.ts`의 범위로 제한한다.
  - 동영상
    - `allowedHosts`에 있는 제공자의 URL 패턴에서 ID만 추출한다.
    - iframe 주소는 제공자별 URL 생성 함수가 다시 만든다.
- `style` 속성은 통째로 허용하지 않는다. 위에서 허용한 속성만 다시 만들어 출력한다.
- `sanitizeHTML(html)`은 같은 경로(파싱 후 직렬화)를 에디터 없이 실행한다.
- 문서 `usage.md`에 다음을 명시한다: 클라이언트 정제는 서버 정제를 대신하지 않는다. 서버에서도 허용 목록 기반 정제를 하라.

### 8.3 붙여넣기 정리 (`io/paste/`)

- `pipeline.ts`는 `PasteCleaner = (html: string) => string` 순수 함수를 차례로 실행한다.
- 정리 함수는 레지스트리에 등록한다. 확장도 `pasteCleaners`로 정리 함수를 추가할 수 있다.
- 기본 정리 함수
  - `cleanWord`: `mso-` 스타일, 조건부 주석, `<o:p>`, Word 목록 표시를 정리하고 목록으로 변환한다.
  - `cleanHwp`: 한글 프로그램이 넣는 스타일과 `<!--StartFragment-->` 주변 마크업을 정리한다.
  - `unwrapGoogleDocs`: `docs-internal-guid` 래퍼, `font-weight:normal`인 `<b>`를 정리하고, 굵게나 기울임을 스타일에서 태그로 변환한다.
  - `normalizeStyles`: 허용 스타일(색상, 정렬)만 남기고 나머지 인라인 스타일을 제거한다.
- 순수 텍스트를 붙여넣으면 줄바꿈 두 번을 문단으로, 한 번을 `hardBreak`로 바꾼다.
- 정리나 파싱 중 예외가 나면 순수 텍스트로 붙여넣는다.

### 8.4 이미지 업로드 (`io/upload.ts`)

1. 파일 선택, 드롭, 붙여넣기, 또는 붙여넣은 HTML 안의 `data:image`로 이미지가 들어온다.
2. `image.accept`(형식)와 `image.maxSize`(용량)로 검사한다. 실패하면 토스트를 띄우고 `uploadError` 이벤트를 보낸다.
3. `URL.createObjectURL`로 만든 미리보기 노드를 진행 표시와 함께 바로 삽입한다. 노드에는 임시 ID 속성을 단다.
4. `upload(file, { onProgress })`를 호출한다.
5. 성공하면 임시 ID로 노드를 찾아 `src`를 결과 URL로 교체하고, objectURL을 해제한다.
   - 이 교체는 실행취소 기록에 남기지 않는다.
   - 사용자가 업로드 중에 노드를 지워서 찾을 수 없으면 결과를 버린다.
6. 실패하면 노드를 제거하고, 토스트를 띄우고, `uploadError` 이벤트를 보낸다.
7. 미리보기 노드가 남아 있는 동안 `getHTML()`은 해당 노드를 빼고 출력한다.

`upload`가 설정되지 않은 경우의 동작은 다음과 같다.

- 이미지 패널에 URL 입력만 보여준다.
- 파일 드롭과 붙여넣기를 하면 "업로드가 설정되지 않았습니다" 토스트를 띄운다.

### 8.5 자동 임시저장 (`io/autosave.ts`)

- `autosave.key`가 있을 때만 동작한다.
- 문서가 바뀌면 디바운스 후 localStorage에 `{ html, savedAt }`을 저장한다.
- 생성 시 임시본이 있고 현재 내용과 다르면 상단 알림 바로 복원할지 묻는다. 선택지는 "불러오기"와 "버리기"다.
- localStorage를 쓸 수 없으면 조용히 비활성화하고 `error` 이벤트를 보낸다.

## 9. 에러 처리

- `EditorError`는 `code`와 `message`를 가진다. 메시지에는 해결 방법을 포함한다.

| 코드 | 상황 | 동작 |
|---|---|---|
| `ELEMENT_NOT_FOUND` | `element`를 찾을 수 없음 | `createEditor`에서 던짐 |
| `SCHEMA_CONFLICT` | 노드나 마크 이름 충돌 | 던짐 |
| `MISSING_DEPENDENCY` | 확장 의존성 누락 | 던짐 |
| `DUPLICATE_EXTENSION` | 확장 이름 중복 | 던짐 |
| `INVALID_OPTION` | 옵션 타입이나 값 오류 | 던짐 |
| `UNKNOWN_UI_ITEM` | 툴바에 없는 항목 ID | 경고 후 건너뜀 |
| `EXTENSION_FAILED` | 확장 초기화 중 예외 | 해당 확장 제외, `error` 이벤트 |
| `CALLBACK_FAILED` | 사용자 콜백(`onChange` 등) 예외 | 잡아서 `error` 이벤트, 계속 동작 |
| `UPLOAD_FAILED`, `UPLOAD_REJECTED` | 업로드 실패, 검사 탈락 | 토스트와 이벤트 |
| `PASTE_FAILED` | 붙여넣기 정리 실패 | 순수 텍스트로 대체 |
| `STORAGE_UNAVAILABLE` | localStorage 사용 불가 | 임시저장 비활성화 |

- 개발자 실수는 생성 시점에 바로 실패시킨다. 최종 사용자가 마주치는 실패는 에디터를 멈추지 않고 알림만 띄운다.

## 10. 코드 원칙 적용

- 수치와 기본값은 `core/defaults.ts` 하나에 둔다. 사용자 설정이 이를 덮어쓴다. 대상 예시:
  - 디바운스 시간
  - 모바일 기준 폭
  - 터치 영역 크기
  - 이미지 최대 용량과 허용 형식
  - 들여쓰기 최대 단계
  - 색상 팔레트
  - 동영상 허용 제공자
  - 코드블록 언어 목록
- 문구는 언어팩에만 둔다. 컴포넌트 코드에 화면에 보이는 문자열 리터럴을 쓰지 않는다.
- 툴바 구성은 프리셋 데이터와 UI 레지스트리로 정해진다. 툴바 코드에 기능 이름이 없다.
- 반복 구조는 팩토리(`markExtension`, `blockExtension`)와 공통 부모(`UIComponent`), 공통 패널 호스트(`PanelHost`)로 묶는다.
- CSS 수치는 CSS 변수로 둔다.

## 11. 테스트와 품질

### 11.1 단위 테스트 (Vitest + jsdom)

- 팩토리: 생성된 스키마, 명령, 단축키, UI 항목
- 확장별 명령과 입력 규칙
- HTML 왕복: `tests/fixtures/roundtrip/*.html`의 각 파일에서 `setHTML` 후 `getHTML` 결과가 원본과 같다.
- 정제: `tests/fixtures/xss/` 문자열(OWASP XSS 필터 우회 사례 기반)이 전부 무해화된다.
- 붙여넣기 정리: Word, 한글, 구글 문서 샘플 HTML을 넣으면 기대 결과가 나온다.
- 설정 병합, 언어 대체 규칙, ExtensionManager의 정렬과 오류 코드
- 업로드 흐름: 성공, 실패, 검사 탈락, 업로드 중 `getHTML`

### 11.2 E2E 테스트 (Playwright, `demo/index.html` 대상)

- 브라우저: Chromium, WebKit
- 화면 크기: 데스크톱, 모바일 에뮬레이션(iPhone, Pixel)
- 시나리오
  - 툴바 서식 적용
  - 마크다운 단축 입력
  - 슬래시 메뉴
  - 링크 패널
  - 표 삽입, 병합, 행 추가
  - 이미지 업로드 (가짜 업로드 함수)
  - 찾기와 바꾸기
  - textarea 폼 전송
  - 다크 모드 전환
  - 모바일 모드에서 툴바 위치와 바텀시트
- 한글 조합 입력: Chromium CDP `Input.imeSetComposition`과 `Input.insertText`로 조합 과정을 재현하고, 결과 문서와 커서 위치를 검증한다.

### 11.3 수동 검증

- `docs/device-checklist.md`에 실기기 체크리스트를 둔다. 대상: iOS Safari, Android Chrome, 삼성 인터넷
- 확인 항목
  - 키보드 위 툴바
  - 한글 조합
  - 이미지 크기 버튼
  - 바텀시트
  - 표 편집
- CI로 완전히 재현할 수 없는 부분이라 이 문서로 보완한다.

### 11.4 품질 기준

- 번들 용량: 빌드 후 스크립트로 코어 ESM 번들의 gzip 크기를 재고, 150KB를 넘으면 실패시킨다.
- 타입 검사(`tsc --noEmit`)와 린트를 통과해야 한다.
- 지원 브라우저
  - 데스크톱 Chrome, Edge, Firefox, Safari: 최신 2개 메이저 버전
  - iOS Safari 16 이상
  - Android Chrome 최신
- 성능: 5만 자 문서에서 데스크톱 Chrome 기준으로 타이핑 중 체감 지연이 없어야 한다. 데모 페이지에 대용량 샘플 버튼을 두고 수동으로 확인한다.

## 12. 구현 순서 (마일스톤)

각 마일스톤이 끝나면 데모 페이지에서 동작을 확인할 수 있어야 한다.

1. **M1 코어와 기본 서식**
   - 빌드 환경, `createEditor`, `Editor`, `ExtensionManager`, 팩토리, `defaults.ts`, i18n, 테마 토큰
   - 4.1 기본 서식, 데스크톱 툴바, HTML 입출력과 정제, 붙여넣기 정리, textarea 모드
2. **M2 미디어와 표**
   - 4.2 이미지(업로드 흐름 포함), 동영상
   - 4.3 표
   - `ContextToolbar`, `PanelHost`(드롭다운)
3. **M3 편의 기능**
   - 4.4 전체: 단축 입력, 슬래시 메뉴, 코드블록, 찾기/바꾸기, 글자 수, 소스 보기, 전체화면, 임시저장
   - 버블 메뉴
4. **M4 모바일과 배포**
   - 모바일 모드(키보드 위 툴바, 상황별 전환, 바텀시트)
   - React/Vue 래퍼, UMD 빌드, 번들 용량 검사
   - E2E 테스트 전체, `usage.md`, `device-checklist.md`
