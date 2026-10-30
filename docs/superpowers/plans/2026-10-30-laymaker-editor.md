# @laymaker/editor 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ProseMirror 엔진 위에, 프레임워크와 무관하게 어디서나 한 줄로 붙여 쓰는 모바일 친화 리치 텍스트 에디터 `@laymaker/editor` v1을 만든다.

**Architecture:**
- 모든 기능은 `Extension` 객체 하나로 선언한다. 선언 항목은 스키마, 명령, 단축키, 입력 규칙, 플러그인, UI 항목, 컴포넌트다.
- `ExtensionManager`가 확장들을 모아 ProseMirror `Schema`와 플러그인, 명령 맵, UI 레지스트리를 조립한다.
- UI는 프레임워크 없는 TS 클래스(`UIComponent`)로 만든다. 툴바와 메뉴는 UI 레지스트리의 항목 ID만 보고 그린다.

**Tech Stack:**
- 런타임: TypeScript 6.0.3, ProseMirror, @floating-ui/dom, lucide, lowlight
- 빌드와 테스트: Vite 8 (라이브러리 모드), Vitest 5 + jsdom, Playwright 1.63

**Spec:** `docs/superpowers/specs/2026-10-30-laymaker-editor-design.md` (이하 "스펙")

## Global Constraints

- 이름 규칙
  - 패키지 이름 `@laymaker/editor`, UMD 전역 변수 `LayEditor`
  - CSS 클래스 접두어 `le-`, CSS 변수 접두어 `--le-`
  - 접두어는 `src/ui/classes.ts`의 `c()` 함수 한 곳에서만 만든다.
- 의존성은 MIT 또는 ISC 라이선스만 쓴다. 정확한 버전으로 고정한다(캐럿 없이).
  - 런타임
    - `prosemirror-model` 1.25.12, `prosemirror-state` 1.4.4, `prosemirror-view` 1.42.8, `prosemirror-transform` 1.12.4
    - `prosemirror-commands` 1.7.2, `prosemirror-keymap` 1.2.3, `prosemirror-history` 1.5.1, `prosemirror-inputrules` 1.5.1
    - `prosemirror-schema-list` 1.6.0, `prosemirror-tables` 1.8.5, `prosemirror-dropcursor` 1.8.4, `prosemirror-gapcursor` 1.4.1
    - `@floating-ui/dom` 1.8.0, `lowlight` 3.3.0, `lucide` 1.65.0
  - 개발용
    - `typescript` 6.0.3: typescript-eslint가 TS 6.1 미만만 지원해서 7을 쓰지 않는다.
    - `vite` 8.3.5, `vitest` 5.0.5, `jsdom` 30.1.3
    - `@playwright/test` 1.63.0: 이 환경에 미리 설치된 Chromium과 맞춘 버전이다.
    - `eslint` 10.14.0, `typescript-eslint` 8.72.1
    - `react`, `react-dom` 19.3.1, `@types/react` 19.3.0, `vue` 3.5.44
  - `react`(`>=18`)와 `vue`(`>=3.3`)는 선택적 `peerDependencies`다.
- 하드코딩 금지
  - 수치와 기본값은 `src/core/defaults.ts`의 `DEFAULTS`에만 둔다.
  - 사용자에게 보이는 문구는 `src/i18n/ko.ts`와 `src/i18n/en.ts`에만 둔다.
  - CSS 수치는 `src/themes/tokens.css`의 CSS 변수로 둔다.
  - 개발자용 오류 메시지는 `src/core/errors.ts`의 힌트 표에만 둔다.
- 반복 구조는 팩토리(`markExtension`, `blockExtension`, `colorMarkExtension`)와 공통 부모(`UIComponent`), 공통 컨트롤 생성기(`ui/controls.ts`), `PanelHost`로 묶는다.
- 노드나 마크를 추가하는 태스크는 다음 두 테스트를 다시 통과시켜야 한다.
  - `tests/unit/io/xss.test.ts`
  - `tests/unit/io/roundtrip.test.ts` (해당 태스크의 픽스처 줄 포함)
- 스펙 5.4의 공개 함수와 타입은 그것을 정의한 태스크에서 `src/index.ts`에 재노출한다. 해당 함수: `sanitizeHTML`, 팩토리 3종, `registerIcon`, `registerLocale`, `registerVideoProvider`
- 지원 브라우저
  - 데스크톱 Chrome, Edge, Firefox, Safari 최신 2개 버전, iOS Safari 16 이상, Android Chrome 최신
  - Vite `build.target`은 `['es2022', 'safari16']`
- 코어 ESM 번들(지연 로딩하는 lowlight 청크 제외)은 gzip 150KB(153600바이트) 이하여야 한다.
- 브랜치와 커밋
  - 작업 브랜치는 `claude/lay-editor-v1`이다.
  - 커밋 메시지는 Conventional Commits 형식이고, 끝에 harness가 지정한 attribution 트레일러를 붙인다.
  - 마일스톤(M1~M4)이 끝날 때마다 `git push -u origin claude/lay-editor-v1`을 실행한다.
- 테스트 명령
  - 단위: `npx vitest run <경로>`
  - E2E: `npx playwright test <경로>`
  - 이 환경에는 Chromium만 있어서 WebKit 프로젝트는 `E2E_WEBKIT=1`일 때만 실행한다.

## Review Focus

1. **경계에서의 한글 조합**: `# ` 입력 규칙 직후, 굵게 서식 안, 표 셀 안에서 한글을 조합할 때 음절이 사라지거나 중복되면 안 된다. 테스트는 Task 10, Task 13의 E2E에 둔다.
2. **한 페이지에 에디터 여러 개**: 툴바 상태, 포털(드롭다운, 바텀시트), 단축키, 임시저장 키가 서로 섞이면 안 된다. 하나를 destroy해도 나머지는 정상 동작해야 한다. 테스트는 Task 10, Task 19에 둔다.
3. **destroy 이후 비동기 작업 완료**: 업로드 Promise, 변경 디바운스, 하이라이터 지연 로딩이 destroy 뒤에 끝나도 예외와 dispatch가 없어야 한다. 테스트는 Task 4, Task 11, Task 16에 둔다.
4. **값이 없거나 이상한 입력**: 래퍼의 `value`가 `undefined`나 `null`일 때, `setHTML('')`일 때, 텍스트 없는 HTML(`<div><br></div>`)일 때 모두 빈 문서가 되고 `getHTML()`은 `''`를 반환해야 한다. 테스트는 Task 4, Task 22에 둔다.
5. **중첩 목록 붙여넣기**: Word에서 2단계 이상 중첩된 목록을 붙여넣으면 중첩 구조가 유지돼야 한다. 테스트는 Task 8에 둔다.

---

## 파일 구조 요약

스펙 3.4를 따르되 다음을 확정한다.

- `src/core/`
  - `types.ts`, `defaults.ts`, `errors.ts`, `EventEmitter.ts`, `merge.ts`, `timing.ts`
  - `state-utils.ts`, `config.ts`, `Editor.ts`, `createEditor.ts`, `ExtensionManager.ts`
- `src/extensions/`
  - `factories.ts`, `index.ts` (`getDefaultExtensions()`)
  - 하위 폴더: `base/`, `marks/`, `blocks/`, `media/`, `table/`, `tools/`
- `src/io/`
  - `html.ts`, `sanitize.ts`, `upload.ts`, `autosave.ts`
  - `paste/pipeline.ts`, `paste/dom.ts`, `paste/cleaners/*.ts`
- `src/ui/`
  - 기반: `classes.ts`, `dom.ts`, `UIComponent.ts`, `icons.ts`, `icon-set.ts`, `shortcut.ts`, `roving.ts`, `focus.ts`, `device.ts`, `theme.ts`, `presets.ts`
  - 컨트롤과 패널: `controls.ts`, `PanelHost.ts`, `Dropdown.ts`, `BottomSheet.ts`, `Toast.ts`, `panels/*.ts`
  - 화면 구성: `EditorUI.ts`, `Toolbar.ts`, `ContextToolbar.ts`, `BubbleMenu.ts`, `SlashMenu.ts`, `StatusBar.ts`, `RestoreBar.ts`, `context.ts`
- `src/adapters/`
  - `react.ts`: JSX 설정 없이 `createElement`로 작성한다. 스펙의 `react.tsx`에서 확장자만 바꾼다.
  - `vue.ts`, `shared.ts`
- `tests/`
  - `setup.ts`, `helpers/editor.ts`
  - `unit/{core,extensions,io,ui,adapters}/`
  - `e2e/`
  - `fixtures/{roundtrip,xss,paste}/`
- `demo/`
  - `index.html`, `main.ts`
  - `upload-plugin.ts`: 개발 서버용 가짜 업로드 엔드포인트
- `scripts/`
  - `build-css.mjs`, `check-size.mjs`, `verify-exports.mjs`

---

# M1 코어와 기본 서식

### Task 1: 프로젝트 골격과 코어 유틸

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts`, `eslint.config.js`, `.gitignore`
- Create: `tests/setup.ts`
- Create: `src/core/defaults.ts`, `src/core/errors.ts`, `src/core/EventEmitter.ts`, `src/core/merge.ts`, `src/core/timing.ts`
- Create: `src/index.ts` (재노출만)
- Test: `tests/unit/core/{events,merge,errors,timing}.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULTS`: `as const` 객체. 키와 값은 아래 Step 3에 정한다.
  - `type EditorErrorCode`: 스펙 9장의 12개 코드
  - `class EditorError extends Error { readonly code: EditorErrorCode; constructor(code: EditorErrorCode, detail?: string, options?: { cause?: unknown }) }`
    - `message`는 `` `[${code}] ${detail} — ${HINTS[code]}` `` 형식이다.
  - `class EventEmitter<E extends Record<string, unknown[]>>`
    - `constructor(opts?: { onListenerError?(error: unknown, event: keyof E): void })`
    - `on<K>(event: K, fn: (...a: E[K]) => void): () => void`
    - `off<K>(event, fn): void`
    - `emit<K>(event, ...a: E[K]): void`
    - `clear(): void`
  - `deepMerge<T>(base: T, ...overrides: Array<DeepPartial<T> | undefined>): T`
    - 일반 객체만 재귀 병합한다. 배열과 함수는 통째로 교체한다. `undefined` 값은 무시한다.
  - `type DeepPartial<T>`
  - `debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { flush(): void; cancel(): void; pending(): boolean }`
  - `rafBatch(fn: () => void): { schedule(): void; flush(): void; cancel(): void }`

- [ ] **Step 1: 골격 작성 후 의존성 설치**
  - `package.json`
    - 필드: `"name": "@laymaker/editor"`, `"type": "module"`, `"sideEffects": ["*.css"]`
    - 의존성: Global Constraints의 고정 버전
    - scripts
      - `dev`: `vite`
      - `build`: `vite build && vite build --config vite.umd.config.ts && node scripts/build-css.mjs && tsc -p tsconfig.build.json && node scripts/verify-exports.mjs && node scripts/check-size.mjs` (뒤쪽 파일들은 Task 23에서 만든다. 그 전까지는 `vite build`만 둔다.)
      - `test`: `vitest run`
      - `test:e2e`: `playwright test`
      - `typecheck`: `tsc --noEmit`
      - `lint`: `eslint .`
  - `tsconfig.json`: `strict`, `target ES2022`, `lib [ES2022, DOM, DOM.Iterable]`, `moduleResolution bundler`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`
  - `tsconfig.build.json`: `emitDeclarationOnly`, `declaration`, `outDir dist/types`, `include ["src"]`
  - `vite.config.ts`
    - `build.lib`: `entry { index: 'src/index.ts' }`, `formats ['es']`
    - `build.target`: `['es2022','safari16']`
    - `rollupOptions.external`: `['react','react-dom','vue']`
    - `test`: `{ environment: 'jsdom', setupFiles: ['tests/setup.ts'], include: ['tests/unit/**/*.test.ts'] }`
  - `tests/setup.ts`: jsdom에 없는 API를 스텁한다.
    - `window.matchMedia`: `matches=false`, `addEventListener` 지원
    - `ResizeObserver`: 아무것도 안 하는 클래스
    - `Range.prototype.getClientRects`와 `getBoundingClientRect`: 0 사각형 반환
    - `document.elementFromPoint`: `null` 반환
    - `window.visualViewport`: 위 값들을 테스트에서 바꿀 수 있는 가변 객체로 만든다.

  Run: `npm install`
  Expected: 설치가 끝나고 `npm ls prosemirror-view`에 1.42.8이 보인다.

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// tests/unit/core/events.test.ts
it('passes args to listeners and unsubscribes via returned fn', () => {
  const e = new EventEmitter<{ a: [number] }>(); const fn = vi.fn();
  const off = e.on('a', fn); e.emit('a', 1); off(); e.emit('a', 2);
  expect(fn).toHaveBeenCalledTimes(1); expect(fn).toHaveBeenCalledWith(1);
});
it('isolates a throwing listener and reports it', () => {
  const onListenerError = vi.fn(); const e = new EventEmitter<{ a: [] }>({ onListenerError });
  const ok = vi.fn(); e.on('a', () => { throw new Error('x'); }); e.on('a', ok); e.emit('a');
  expect(ok).toHaveBeenCalled(); expect(onListenerError).toHaveBeenCalledWith(expect.any(Error), 'a');
});
// tests/unit/core/merge.test.ts
it('merges objects, replaces arrays, ignores undefined', () => {
  expect(deepMerge({ a: { b: 1, c: [1] } }, { a: { c: [2] } }, { a: { b: undefined } }))
    .toEqual({ a: { b: 1, c: [2] } });
});
// tests/unit/core/errors.test.ts
it('carries code, detail and hint', () => {
  const e = new EditorError('ELEMENT_NOT_FOUND', '#x');
  expect(e).toBeInstanceOf(Error); expect(e.code).toBe('ELEMENT_NOT_FOUND');
  expect(e.message).toMatch(/^\[ELEMENT_NOT_FOUND\] #x — .+/);
});
// tests/unit/core/timing.test.ts
it('debounce delays, flush runs now, cancel drops', () => {
  vi.useFakeTimers(); const fn = vi.fn(); const d = debounce(fn, 300);
  d(1); vi.advanceTimersByTime(299); expect(fn).not.toHaveBeenCalled();
  d(2); d.flush(); expect(fn).toHaveBeenCalledWith(2);
  d(3); d.cancel(); vi.runAllTimers(); expect(fn).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: 실패를 확인한 뒤 구현**
  - `npx vitest run tests/unit/core`를 실행해 FAIL(모듈 없음)을 확인한다.
  - 그다음 위 시그니처대로 구현한다.
  - `DEFAULTS` 초기 키는 아래와 같다. 이후 태스크는 이 객체에 키를 추가만 한다.
    - `preset: 'full'`, `locale: 'ko'`, `theme: 'auto'`, `changeDebounce: 300`
    - `mobileBreakpoint: 768`, `touchTarget: 44`, `toast: { duration: 4000 }`
    - `url: { protocols: ['http:','https:','mailto:','tel:'], dataImageTypes: ['image/png','image/jpeg','image/gif','image/webp'] }`

- [ ] **Step 4: 통과 확인**
  - Run: `npx vitest run tests/unit/core && npx tsc --noEmit && npx eslint .`
  - Expected: 전부 PASS, 오류 0

- [ ] **Step 5: 커밋** `chore: scaffold project and core utilities`

---

### Task 2: 언어팩(i18n)

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/ko.ts`, `src/i18n/en.ts`
- Test: `tests/unit/i18n.test.ts`

**Interfaces:**
- Produces:
  - `type LocalePack = { [key: string]: string | LocalePack }`
  - `type Translate = (key: string, params?: Record<string, string | number>) => string`
  - `registerLocale(code: string, pack: LocalePack): void`
  - `createTranslator(locale: string | LocalePack): Translate`
    - 찾는 순서: 지정 언어 → `en` → 키 이름
    - `{name}` 자리표시자를 치환한다.
    - 객체로 넘긴 팩은 `en` 위에 `deepMerge`한다.
  - `flattenKeys(pack: LocalePack): string[]`: 테스트용으로 내보낸다.
- 키 규칙
  - 툴바 항목: `toolbar.<itemId>`, 하위 옵션: `toolbar.<itemId>.<option>`
  - 패널: `panel.<name>.<field>`
  - 토스트: `toast.<name>`
  - 상태 표시줄: `status.<name>`
  - 그 외: `placeholder`, `a11y.<name>`
- 이 태스크에서 넣는 키: `placeholder`(ko: "내용을 입력하세요", en: "Start writing…"), `toolbar.more`(더보기 / More), `a11y.toolbar`(서식 도구 / Formatting tools)

- [ ] **Step 1: 실패하는 테스트**

```ts
it('translates and interpolates', () => {
  registerLocale('zz', { hi: '안녕 {name}' });
  expect(createTranslator('zz')('hi', { name: '민' })).toBe('안녕 민');
});
it('falls back to en, then to the key', () => {
  const t = createTranslator('zz');
  expect(t('toolbar.more')).toBe('More'); expect(t('no.such.key')).toBe('no.such.key');
});
it('merges a partial custom pack over en', () => {
  expect(createTranslator({ toolbar: { more: '…' } })('placeholder')).toBe('Start writing…');
});
it('ko defines every key en defines', () => {
  expect(flattenKeys(ko).sort()).toEqual(flattenKeys(en).sort());
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/i18n.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다. `ko`와 `en`은 기본으로 등록된다.
- [ ] **Step 4:** 같은 명령을 다시 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(i18n): add translator with ko/en packs`

---

### Task 3: 확장 타입, 팩토리, ExtensionManager

**Files:**
- Create: `src/core/types.ts`, `src/extensions/factories.ts`, `src/core/ExtensionManager.ts`, `src/core/state-utils.ts`
- Test: `tests/unit/core/extension-manager.test.ts`, `tests/unit/extensions/factories.test.ts`, `tests/unit/core/state-utils.test.ts`

**Interfaces:**
- Consumes: Task 1의 `DEFAULTS`, `EditorError`, `deepMerge`. Task 2의 `Translate`
- Produces (`src/core/types.ts`):

```ts
export type ThemeMode = 'light' | 'dark' | 'auto';
export type DeviceMode = 'desktop' | 'mobile';
export type UIContext = 'text' | 'table' | 'image' | 'link' | 'codeBlock';
export type UISlot = 'top' | 'status' | 'overlay';
export type CommandFactory = (...args: any[]) => Command;           // prosemirror-state Command
export interface GlobalAttributeSpec {
  types: string[];
  attrs: Record<string, { default: unknown; parse(dom: HTMLElement): unknown;
                          render(value: unknown): Record<string, string> | null }>;
}
export interface ExtensionContext<O = any> { editor: Editor; options: O; schema: Schema; config: EditorConfig; t: Translate }
export interface UIItem {                       // 스펙 6.2 + 아래 필드
  id: string; kind: 'button' | 'dropdown' | 'panel'; icon: string; label: string;
  command?: string; args?: unknown[]; shortcut?: string; contexts: UIContext[];
  isActive?(editor: Editor): boolean; isEnabled?(editor: Editor): boolean;
  options?: UIItem[]; panel?: PanelFactory; slash?: { keywords: string[] };
}
export interface ComponentSpec { slot: UISlot; create(editor: Editor, ui: EditorUI): UIComponent }
export interface Extension<O = any> {
  name: string; optionsKey?: string; defaults?: O; dependencies?: string[]; priority?: number; // 기본 100
  nodes?: Record<string, NodeSpec & { transient?(node: PMNode): boolean }>;
  marks?: Record<string, MarkSpec>;
  globalAttributes?: GlobalAttributeSpec[];
  commands?(ctx: ExtensionContext<O>): Record<string, CommandFactory>;
  keymap?(ctx: ExtensionContext<O>): Record<string, string | Command>;   // 문자열 = 명령 이름
  inputRules?(ctx: ExtensionContext<O>): InputRule[];
  plugins?(ctx: ExtensionContext<O>): Plugin[];
  nodeViews?(ctx: ExtensionContext<O>): Record<string, NodeViewConstructor>;
  pasteCleaners?: PasteCleaner[];
  ui?(ctx: ExtensionContext<O>): UIItem[];
  components?(ctx: ExtensionContext<O>): ComponentSpec[];
  onCreate?(ctx: ExtensionContext<O>): void | (() => void);   // 반환 함수는 destroy 때 호출
}
```

  - `PanelFactory`, `EditorUI`, `UIComponent`, `Editor`, `EditorConfig`, `PasteCleaner`는 타입만 먼저 선언한다. 구현은 각 태스크에서 한다.
- Produces (`factories.ts`):
  - `commandName(verb: string, name: string): string`: 예를 들어 `('toggle','codeBlock')`는 `'toggleCodeBlock'`이다.
  - `defineExtension<O>(ext: Extension<O>): Extension<O>`: 이름이 비면 `INVALID_OPTION`을 던진다.
  - `markExtension(cfg: { name; tags: string[]; parse?: ParseRule[]; toDOM?: MarkSpec['toDOM']; attrs?; excludes?; inclusive?; shortcut?: string; icon: string; inputRule?: RegExp; extend?: Partial<Extension> }): Extension`
    - 생성하는 것
      - `marks[name]`: `parseDOM`은 `tags`에 `cfg.parse`를 더한 것이고, `toDOM`의 기본값은 `[tags[0], 0]`이다.
      - 명령 `toggle<Name>`과 `unset<Name>`
      - `keymap { [shortcut]: 'toggle<Name>' }`
      - 입력 규칙: 정규식의 1번 그룹을 마크로 감싼다.
      - UI 항목 `{ id: name, kind: 'button', label: 'toolbar.'+name, command: 'toggle<Name>', contexts: ['text','table'], isActive: e => e.isActive(name) }`
  - `blockExtension(cfg: { name; kind: 'textblock' | 'wrapper'; tag: string; content?: string; attrs?; parse?: ParseRule[]; toDOM?; defining?; code?; marks?; shortcut?: string; icon: string; inputRule?: { pattern: RegExp; attrs?(m: RegExpMatchArray): Attrs }; slash?: { keywords: string[] }; extend?: Partial<Extension> }): Extension`
    - textblock은 `setBlockType`으로 `set<Name>(attrs?)`과 `toggle<Name>(attrs?)`을 만든다. toggle은 이미 적용돼 있으면 paragraph로 되돌린다.
    - wrapper는 `wrapIn`과 `lift`로 `toggle<Name>()`을 만든다.
  - `extend` 병합 규칙
    - 함수 필드(`commands`, `keymap`, `ui` 등)는 둘 다 호출해서 결과를 합친다. 객체는 병합하고 배열은 이어 붙인다.
    - 스칼라 필드는 `extend` 쪽이 이긴다.
- Produces (`ExtensionManager.ts`):

```ts
export class ExtensionManager {
  constructor(extensions: Extension[], config: EditorConfig, report: (e: EditorError) => void);
  readonly schema: Schema;
  readonly resolved: ReadonlyArray<{ ext: Extension; options: unknown }>;
  createCommands(editor: Editor): Map<string, CommandFactory>;
  createPlugins(editor: Editor, commands: Map<string, CommandFactory>): Plugin[];
  createNodeViews(editor: Editor): Record<string, NodeViewConstructor>;
  pasteCleaners(): PasteCleaner[];
  createUIRegistry(editor: Editor): Map<string, UIItem>;
  createComponents(editor: Editor): ComponentSpec[];
  runCreate(editor: Editor): void; runDestroy(): void;
  static buildSchema(extensions: Extension[]): Schema;   // 에디터 없이 스키마만 (sanitizeHTML용)
}
```

  - 옵션은 `deepMerge(ext.defaults, config.raw[ext.optionsKey ?? ext.name])`로 정한다.
  - 정렬은 의존성 위상 정렬이다. 의존 관계가 없으면 입력 순서를 유지한다.
  - 스키마의 노드와 마크 순서는 정렬 결과를 따른다.
  - 키맵과 플러그인은 `priority` 내림차순으로 모은다.
  - `globalAttributes`는 대상 노드 스펙에 attrs를 추가한다. `parseDOM`의 `getAttrs`와 `toDOM` 결과에 값을 주입한다. 둘 다 `style` 속성을 만들면 `;`로 이어 붙인다.
  - 수집 단계(create\*)에서 확장 하나가 예외를 던지면 그 확장만 빼고 `EXTENSION_FAILED`를 `report`한다.
- Produces (`state-utils.ts`):
  - `isMarkActive(state, type: MarkType, attrs?): boolean`
  - `isNodeActive(state, type: NodeType, attrs?): boolean`: 선택된 노드나 조상 노드를 본다.
  - `getMarkRange(state, type): { from: number; to: number } | null`
  - `findParent(state, pred: (n: PMNode) => boolean): { node: PMNode; pos: number; depth: number } | null`
  - `findNodeByAttr(doc, attr: string, value: unknown): { node: PMNode; pos: number } | null`

- [ ] **Step 1: 실패하는 테스트.** 가짜 에디터는 `{ t: createTranslator('en') } as unknown as Editor`로 만든다.

```ts
// factories.test.ts
it('markExtension generates spec, toggle command, keymap and UI item', () => {
  const ext = markExtension({ name: 'bold', tags: ['strong', 'b'], shortcut: 'Mod-b', icon: 'bold' });
  expect(ext.marks!.bold!.parseDOM!.map(r => (r as TagParseRule).tag)).toEqual(['strong', 'b']);
  const ctx = fakeCtx(ext);
  expect(Object.keys(ext.commands!(ctx))).toEqual(['toggleBold', 'unsetBold']);
  expect(ext.keymap!(ctx)).toEqual({ 'Mod-b': 'toggleBold' });
  expect(ext.ui!(ctx)[0]).toMatchObject({ id: 'bold', command: 'toggleBold', label: 'toolbar.bold', contexts: ['text', 'table'] });
});
it('blockExtension wrapper toggles via wrapIn/lift', /* blockquote 문서에 적용→해제 결과 확인 */);
it('extend merges function fields from both sides', /* commands 두 출처 키가 모두 존재 */);
// extension-manager.test.ts
it('throws DUPLICATE_EXTENSION / MISSING_DEPENDENCY / SCHEMA_CONFLICT', /* 각각 code 확인 */);
it('orders by dependencies but keeps input order otherwise', /* [c(dep a), a, b] → a, c, b */);
it('merges options from config.raw[optionsKey ?? name] over defaults');
it('injects global attributes into parse and render', /* paragraph에 align 주입 → style 왕복 */);
it('skips an extension whose plugins() throws and reports EXTENSION_FAILED');
it('collects keymaps by priority (higher first)');
```

- [ ] **Step 2:** `npx vitest run tests/unit/core tests/unit/extensions`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다. `state-utils` 테스트도 같이 작성한다(함수당 1~2개 케이스).
- [ ] **Step 4:** 같은 명령을 다시 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(core): add extension types, factories and ExtensionManager`

---

### Task 4: Editor, createEditor, HTML 입출력, 기본 확장, textarea 모드

**Files:**
- Create: `src/core/config.ts`, `src/core/Editor.ts`, `src/core/createEditor.ts`, `src/io/html.ts`
- Create: `src/extensions/base/{base.ts,history.ts,cursors.ts}`, `src/extensions/index.ts`
- Create: `tests/helpers/editor.ts`
- Create: `tests/fixtures/roundtrip/base.html`
- Test: `tests/unit/core/editor.test.ts`, `tests/unit/core/textarea.test.ts`, `tests/unit/io/roundtrip.test.ts`

**Interfaces:**
- Consumes: Task 1~3의 전부
- Produces:
  - `interface EditorOptions`: 스펙 5.1과 같다. 단, 스펙과 다른 점이 두 가지 있다.
    - 확장별 옵션은 `[extensionName or optionsKey]: object` 형태로 받는다.
    - `video.allowedHosts`는 `video.providers`(제공자 ID 배열)로 이름을 바꾼다. 값이 호스트가 아니라 제공자 ID이기 때문이다.
  - `interface EditorConfig { element: HTMLElement; textarea: HTMLTextAreaElement | null; content: string; preset; toolbar: string[] | null; locale; theme; placeholder: string | null; upload: UploadFn | null; changeDebounce: number; extensions: Extension[]; disable: string[]; raw: EditorOptions; onChange?; onReady? }`
  - `resolveConfig(options: EditorOptions): EditorConfig`
    - 다음 경우 `INVALID_OPTION`을 던진다: `theme`이나 `preset`이 허용 값이 아님, `changeDebounce < 0`, `upload`가 함수가 아님
    - 요소를 못 찾으면 `ELEMENT_NOT_FOUND`를 던진다.
  - `createEditor(options: EditorOptions): Editor`
  - `class Editor`
    - 속성: `config`, `schema`, `view`, `root: HTMLElement`, `content: HTMLElement`, `t: Translate`, `commands: Map`, `manager: ExtensionManager`, `ui: EditorUI | null`(Task 10 전에는 `null`), `state` getter, `isEditable` getter
    - 메서드는 스펙 5.2 표 전체다. 여기에 아래가 더해진다.
      - `reportError(e: EditorError): void`: `error` 이벤트와 `console.error`
      - `flushChange(): void`
  - `type EditorEvents`
    - 스펙 5.3의 이벤트들
    - `update`는 `[tr: Transaction]`을 인자로 받는다.
    - `modeChange: [DeviceMode]`를 추가한다(Task 21에서 사용).
  - `type UploadResult = { url: string; alt?: string }`
  - `type UploadFn = (file: File, ctx: { onProgress(ratio: number): void }) => Promise<UploadResult>`
  - `parseHTML(schema, html: string): PMNode`: `DOMParser`로 파싱한 뒤 `PMDOMParser.fromSchema(schema).parse(body)`
  - `serializeHTML(schema, doc): string`
    - `spec.transient(node)`가 참인 노드는 빼고 직렬화한다.
    - 빈 문서면 `''`를 반환한다.
  - `formatHTML(html: string): string`: 블록 태그마다 줄을 바꾼다. 소스 보기용이다.
  - `getDefaultExtensions(): Extension[]`: 이후 태스크는 여기에 자기 확장을 추가한다.
  - `tests/helpers/editor.ts`
    - `makeEditor(opts?: Partial<EditorOptions>): Editor`
    - `typeText(editor, text): void`: 글자마다 `handleTextInput`을 통과시켜 입력 규칙이 작동하게 한다.
    - `selectText(editor, text): void`
    - `select(editor, spec: string): void`: `'node:<pos>'`면 노드 선택, `'text:<문자열>'`이면 텍스트 선택
    - `press(editor, key: string): boolean`: `handleKeyDown`을 통과시킨다.
    - `flushPromises(): Promise<void>`
    - `cleanupEditors(): void`: `tests/setup.ts`의 `afterEach`에 등록한다.
- 기본 확장(`base.ts`)
  - 노드: `doc`, `paragraph`(`p`), `text`, `hardBreak`(`br`, 단축키 `Shift-Enter`와 `Mod-Enter`)
  - `baseKeymap`을 priority 0으로 넣는다.
  - `history.ts`
    - 명령 `undo`, `redo`
    - 단축키 `Mod-z`, `Mod-y`, `Mod-Shift-z`
    - UI 항목 `undo`, `redo` (ko: 실행 취소 / 다시 실행)
  - `cursors.ts`: dropcursor와 gapcursor
- DOM 구조: 루트 `div.le-editor`(`data-theme`, `data-mode` 속성) 안에 `div.le-content.le-prose`가 있고, 그 안에 ProseMirror가 들어간다.
- 변경 흐름은 스펙 6.5를 따른다.
  - `dispatchTransaction` 안에서 `update`를 emit한다.
  - 선택이 바뀌면 `selectionChange`를 emit한다.
  - `docChanged`면 `debounce(changeDebounce)`를 걸고, 끝나면 `change`, `onChange`, textarea 동기화를 실행한다.
  - 사용자 콜백이 예외를 던지면 `CALLBACK_FAILED`로 처리한다.
- textarea 모드
  - textarea는 `display:none`으로 숨긴다(원래 값은 저장해 둔다).
  - 루트를 textarea 바로 뒤에 삽입한다.
  - `form`의 `submit` 이벤트를 capture 단계에서 받아 `flushChange()`를 호출한다. `blur` 때도 `flushChange()`를 호출한다.
  - destroy하면 textarea를 원래대로 되돌린다.
- destroy 이후 `exec`, `setHTML`, 디바운스된 콜백은 아무것도 하지 않는다.

- [ ] **Step 1: 실패하는 테스트**

```ts
// editor.test.ts
it('throws ELEMENT_NOT_FOUND for a missing selector', () => {
  expect(() => createEditor({ element: '#nope' })).toThrowError(expect.objectContaining({ code: 'ELEMENT_NOT_FOUND' }));
});
it('throws INVALID_OPTION for an unknown theme', /* theme: 'blue' as any */);
it('round-trips content and returns "" when empty', () => {
  const ed = makeEditor({ content: '<p>a</p>' }); expect(ed.getHTML()).toBe('<p>a</p>');
  for (const v of ['', '<div><br></div>', '<p></p>']) { ed.setHTML(v); expect(ed.getHTML()).toBe(''); expect(ed.isEmpty()).toBe(true); }
});
it('emits change once after the debounce', () => {
  vi.useFakeTimers(); const onChange = vi.fn(); const ed = makeEditor({ onChange });
  typeText(ed, 'ab'); vi.advanceTimersByTime(299); expect(onChange).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(onChange).toHaveBeenCalledWith('<p>ab</p>');
});
it('survives a throwing onChange and reports CALLBACK_FAILED', /* error 이벤트 code 확인 후 typeText 계속 동작 */);
it('exec returns false and warns for unknown commands');
it('can/isActive/getText/setEditable/focus events', /* can('undo') false→true, isActive('paragraph'), getText, setEditable(false) → view.editable false, focus() → focus 이벤트 */);
it('undo/redo via exec', /* typeText 'a' → exec('undo') → '' → exec('redo') → '<p>a</p>' */);
it('does nothing after destroy, including a pending change', () => {
  vi.useFakeTimers(); const onChange = vi.fn(); const ed = makeEditor({ onChange });
  typeText(ed, 'a'); ed.destroy(); vi.runAllTimers();
  expect(onChange).not.toHaveBeenCalled(); expect(ed.exec('undo')).toBe(false);
  expect(document.querySelector('.le-editor')).toBeNull();
});
// textarea.test.ts
it('hides the textarea, loads its value, syncs on change and on submit, restores on destroy', () => {
  document.body.innerHTML = '<form><textarea name="body"><p>x</p></textarea></form>';
  const ta = document.querySelector('textarea')!; const ed = createEditor({ element: ta });
  expect(ta.style.display).toBe('none'); expect(ed.getHTML()).toBe('<p>x</p>');
  typeText(ed, 'y'); ta.form!.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(ta.value).toBe('<p>xy</p>'); ed.destroy(); expect(ta.style.display).toBe('');
});
// roundtrip.test.ts — fixtures/roundtrip/*.html의 비어 있지 않은 각 줄이 케이스 하나
it.each(loadRoundtripCases())('%s round-trips', (_file, line) => {
  const ed = makeEditor({ content: line }); expect(ed.getHTML()).toBe(line);
});
```

  - `base.html` 픽스처 내용: `<p>a</p>`, `<p>a<br>b</p>`, `<p>a</p><p>b</p>`

- [ ] **Step 2:** `npx vitest run tests/unit/core tests/unit/io`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다. `src/index.ts`에서 `createEditor`, `Editor`, `EditorError`, 타입들을 재노출한다.
- [ ] **Step 4:** 같은 명령을 다시 실행한 뒤 `npx tsc --noEmit`도 실행한다. Expected: 둘 다 PASS
- [ ] **Step 5: 커밋** `feat(core): add Editor, createEditor, HTML io and textarea mode`

---

### Task 5: XSS 정제

**Files:**
- Create: `src/io/sanitize.ts`
- Create: `tests/fixtures/xss/vectors.json`
- Test: `tests/unit/io/sanitize.test.ts`, `tests/unit/io/xss.test.ts`

**Interfaces:**
- Produces:
  - `safeUrl(v: string | null | undefined, opts?: { allowDataImage?: boolean }): string | null`
    - 앞뒤 공백과 제어문자, 탭과 개행을 제거한 뒤 프로토콜을 판정한다.
    - 허용: `DEFAULTS.url.protocols`, 상대경로(`/a`, `a.html`, `#x`, `?q`)
    - `data:`는 `allowDataImage`이면서 `DEFAULTS.url.dataImageTypes`에 해당하는 base64일 때만 허용한다.
  - `safeColor(v): string | null`: `#rgb`, `#rrggbb`, `rgb(r,g,b)`, `rgba(r,g,b,a)`만 받는다. 숫자 범위를 검사하고, 공백을 정규화한 문자열을 반환한다.
  - `clampWidth(v: string | number | null | undefined): number | null`: `%` 숫자만 받고, `DEFAULTS.image.minWidth`~`maxWidth` 범위로 자른다.
    - 이 태스크에서 `DEFAULTS.image`를 `{ minWidth: 10, maxWidth: 100 }`로 추가한다.
  - `safeLanguage(v): string | null`: `/^[a-z0-9+#-]{1,20}$/i`
  - `oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null`
  - `sanitizeHTML(html: string, opts?: { extensions?: Extension[]; disable?: string[] }): string`
    - `getDefaultExtensions()`로 스키마를 만든다. 기본 확장 조합의 스키마는 캐시한다.
    - 그다음 `parseHTML`과 `serializeHTML`을 거친다.
- 이후 태스크의 모든 `parseDOM.getAttrs`는 반드시 위 검증 함수를 거쳐야 한다.

- [ ] **Step 1: 실패하는 테스트**

```ts
// sanitize.test.ts
it.each(['https://a.com', 'http://a.com', 'mailto:a@b.c', 'tel:010', '/a', 'a.html', '#x'])('safeUrl keeps %s', v => expect(safeUrl(v)).toBe(v));
it.each(['javascript:alert(1)', ' javascript:alert(1)', 'java\tscript:x', 'JaVaScRiPt:x', 'vbscript:x', 'data:text/html,x', 'data:image/png;base64,AAA'])
  ('safeUrl rejects %s', v => expect(safeUrl(v)).toBeNull());
it('safeUrl allows data images only when asked', () => expect(safeUrl('data:image/png;base64,AAA', { allowDataImage: true })).not.toBeNull());
it.each([['#fff', '#fff'], ['rgb(1, 2, 3)', 'rgb(1,2,3)'], ['rgba(1,2,3,0.5)', 'rgba(1,2,3,0.5)']])('safeColor %s', (i, o) => expect(safeColor(i)).toBe(o));
it.each(['red', 'url(x)', 'expression(alert(1))', 'rgb(300,0,0)', '#ggg'])('safeColor rejects %s', v => expect(safeColor(v)).toBeNull());
it.each([['50%', 50], ['5%', 10], ['150%', 100], ['50px', null], ['abc', null]])('clampWidth %s', (i, o) => expect(clampWidth(i)).toBe(o));
// xss.test.ts
const FORBIDDEN = /<script|javascript:|vbscript:|\son\w+\s*=|<object|<embed|<svg|<style|<math|<form|<input|<base|<meta|srcdoc|data:text|expression\(|url\(/i;
it.each(vectors)('$name is neutralised', ({ input }) => {
  const out = sanitizeHTML(input); expect(out).not.toMatch(FORBIDDEN);
  for (const src of out.match(/<iframe[^>]+src="([^"]+)"/g) ?? []) expect(src).toMatch(/src="https:\/\/(www\.youtube-nocookie\.com\/embed|player\.vimeo\.com\/video)\//);
});
it('keeps safe content', () => expect(sanitizeHTML('<p>a<br>b</p>')).toBe('<p>a<br>b</p>'));
```

  - `vectors.json`의 `{ name, input }` 항목(최소 30개)
    - 이벤트 핸들러: `<img src=x onerror>`, `<svg onload>`, `<details open ontoggle>`, `<body onload>`, `<input autofocus onfocus>`, `<a href="https://ok" onclick>`
    - 프로토콜 변형: `javascript:`의 대소문자, 탭, 엔티티(`&#x09;`) 변형, `vbscript:`
    - `data:` 계열: `data:text/html` 링크, `data:` 스크립트 이미지
    - 임베드와 위험 태그: `<iframe src=evil>`, `<iframe src=javascript:>`, `<object>`, `<embed>`, `<form action=javascript:>`, `<base href>`, `<meta refresh>`
    - mXSS: `<math><mtext><table><mglyph><style><img onerror>`
    - 스타일 공격: `style="background:url(javascript:)"`, `color:expression()`, `behavior:url()`, `background-image:url(javascript:)`가 든 td, `<mark style="background-color:url(...)">`
    - 속성 탈출: `data-video` 속성 탈출 시도, `<figure data-align='center" onmouseover="...'>`, `<pre><code class='language-js" onclick="...'>`
    - 기타: `<table background=javascript:>`

- [ ] **Step 2:** `npx vitest run tests/unit/io`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 같은 명령을 다시 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(io): add attribute validators, sanitizeHTML and XSS suite`

---

### Task 6: 글자 서식 확장

**Files:**
- Create: `src/extensions/marks/{basic.ts,colorMark.ts,link.ts,clearFormat.ts}`
- Modify: `src/extensions/index.ts`, `src/core/defaults.ts`, `src/i18n/{ko,en}.ts`
- Create: `tests/fixtures/roundtrip/marks.html`
- Test: `tests/unit/extensions/marks.test.ts`

**Interfaces:**
- Consumes: Task 3의 `markExtension`, `defineExtension`. Task 5의 `safeUrl`, `safeColor`
- Produces:
  - `basic.ts`: 아래 5개를 `markExtension`으로 만든다. 표기 순서는 이름 / 태그 / 추가 파싱 규칙 / 단축키 / 입력 규칙이다.
    - `bold` / `strong`, `b` / `font-weight` bold 또는 600 이상, 단 `<b style="font-weight:normal">`는 제외 / `Mod-b` / `\*\*([^*]+)\*\*$`
    - `italic` / `em`, `i` / `font-style:italic` / `Mod-i` / `(?:^|\s)\*([^*\s][^*]*)\*$`
    - `underline` / `u` / `text-decoration` underline / `Mod-u` / 없음
    - `strike` / `s`, `del`, `strike` / `text-decoration` line-through / `Mod-Shift-s` / `~~([^~]+)~~$`
    - `code` / `code` / 없음 / `Mod-e` / `` `([^`]+)`$ ``. 추가로 `excludes: '_'`
  - `colorMarkExtension(cfg: { name: 'textColor' | 'highlight'; tag: 'span' | 'mark'; cssProp: 'color' | 'background-color'; paletteKey: 'text' | 'highlight'; icon: string }): Extension`
    - `optionsKey: 'colors'`, `defaults: DEFAULTS.colors`
    - 마크 attrs는 `{ color }`이다. parse는 `safeColor`를 거친다.
    - 명령 `set<Name>(color)`는 `safeColor`가 실패하면 false를 반환한다. 명령 `unset<Name>()`도 만든다.
    - UI는 `kind: 'panel'` 항목이다. 패널은 `ui/panels/colorPanel.ts`에 두고 Task 10에서 연결한다.
    - `textColor`와 `highlight`는 둘 다 이 팩토리로 만든다. `highlight`는 `span[style*=background-color]`도 파싱한다(Word 대응).
  - `DEFAULTS.colors`에 각 10색을 둔다.
    - `text`: `['#000000','#495057','#e03131','#f08c00','#2f9e44','#1971c2','#6741d9','#c2255c','#0c8599','#868e96']`
    - `highlight`: `['#ffec99','#ffd8a8','#ffc9c9','#d3f9d8','#d0ebff','#e5dbff','#fcc2d7','#c5f6fa','#e9ecef','#fff3bf']`
  - `link.ts`
    - 마크 `link`의 attrs는 `{ href, target: null | '_blank' }`이고 `inclusive: false`다.
    - `toDOM`은 `['a', { href, target, rel: target ? 'noopener noreferrer' : null }, 0]`이다.
    - 명령
      - `setLink({ href: string; newTab?: boolean })`: `safeUrl`이 실패하면 false. 선택이 비어 있으면 href를 텍스트로 넣고 링크를 건다.
      - `unsetLink()`
      - `openLinkPanel()`: `editor.ui?.openPanelFor('link')`를 호출하고 true를 반환한다.
    - 단축키 `Mod-k` → `openLinkPanel`
    - 자동 링크 입력 규칙: `/(?:^|\s)((?:https?:\/\/|www\.)[^\s]+)\s$/`. `www.`로 시작하면 `https://`를 붙인다.
  - `clearFormat.ts`: 명령 `clearFormat()`은 선택 범위에서 `link`를 뺀 모든 마크를 제거한다. UI 버튼도 만든다.
  - 언어팩 키: `toolbar.{bold,italic,underline,strike,code,textColor,highlight,link,clearFormat}`, `panel.color.{reset}`, `panel.link.{url,newTab,apply,remove}`
- `marks.html` 픽스처 내용

```
<p><strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code></p>
<p><span style="color:#e03131">a</span><mark style="background-color:#ffec99">b</mark></p>
<p><a href="https://a.com">a</a><a href="https://b.com" target="_blank" rel="noopener noreferrer">b</a></p>
```

- [ ] **Step 1: 실패하는 테스트**

```ts
it('toggles bold on a selection', () => { const ed = makeEditor({ content: '<p>abc</p>' }); selectText(ed, 'ab'); ed.exec('toggleBold'); expect(ed.getHTML()).toBe('<p><strong>ab</strong>c</p>'); });
it.each([['**ab**', '<p><strong>ab</strong></p>'], ['~~ab~~', '<p><s>ab</s></p>'], ['`ab`', '<p><code>ab</code></p>'], ['x *ab*', '<p>x <em>ab</em></p>']])
  ('input rule %s', (input, out) => { const ed = makeEditor(); typeText(ed, input); expect(ed.getHTML()).toBe(out); });
it('ignores <b style="font-weight:normal">', () => expect(makeEditor({ content: '<p><b style="font-weight:normal">a</b></p>' }).getHTML()).toBe('<p>a</p>'));
it('setTextColor validates', () => { const ed = makeEditor({ content: '<p>a</p>' }); selectText(ed, 'a');
  expect(ed.exec('setTextColor', 'red')).toBe(false); expect(ed.exec('setTextColor', '#e03131')).toBe(true); });
it('setLink adds rel for new tab and rejects javascript:', /* 두 결과 확인 */);
it('autolinks typed URLs', () => { const ed = makeEditor(); typeText(ed, 'www.a.com ');
  expect(ed.getHTML()).toBe('<p><a href="https://www.a.com">www.a.com</a> </p>'); });
it('clearFormat keeps links', /* bold+link → link만 남음 */);
```

- [ ] **Step 2:** `npx vitest run tests/unit/extensions/marks.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현하고 `getDefaultExtensions()`에 추가한다.
- [ ] **Step 4:** `npx vitest run tests/unit`을 실행한다. Expected: roundtrip, xss를 포함해 전부 PASS
- [ ] **Step 5: 커밋** `feat(marks): add text marks, colors, link and clear format`

---

### Task 7: 블록 확장

**Files:**
- Create: `src/extensions/blocks/{heading.ts,blockquote.ts,lists.ts,horizontalRule.ts,align.ts,indent.ts}`, `src/extensions/base/placeholder.ts`
- Modify: `src/extensions/index.ts`, `src/core/defaults.ts`, `src/i18n/{ko,en}.ts`
- Create: `tests/fixtures/roundtrip/blocks.html`
- Test: `tests/unit/extensions/blocks.test.ts`

**Interfaces:**
- Produces:
  - `heading`
    - `blockExtension({ kind: 'textblock', attrs: { level: { default: 1 } } })`
    - 레벨은 `DEFAULTS.heading.levels = [1,2,3,4]`이다. `h5`와 `h6`은 마지막 레벨로 파싱한다.
    - 명령 `setHeading(level)`, `toggleHeading(level)`, `setParagraph()`
    - 단축키 `Mod-Alt-1`~`4`, `Mod-Alt-0`
    - 입력 규칙 `^(#{1,4})\s$`
    - UI는 `kind: 'dropdown'`인 `heading` 항목이다. 하위 옵션은 본문과 H1~H4다.
    - 슬래시 키워드는 레벨마다 `['h1','제목1','heading1']` 형식으로 둔다.
  - `blockquote`
    - `blockExtension({ kind: 'wrapper', tag: 'blockquote' })`
    - 단축키 `Mod-Shift-b`, 입력 규칙 `^>\s$`, 슬래시 키워드 `['quote','인용']`
  - `lists.ts`
    - 노드
      - `bulletList`: `ul`
      - `orderedList`: `ol`, `start` 속성
      - `listItem`: 내용 `'paragraph block*'`
      - `taskList`: `ul[data-type=taskList]`
      - `taskItem`: `li`, `data-checked` 속성. NodeView에 체크박스(`contenteditable=false`)를 넣는다.
    - 명령
      - `toggleBulletList()`, `toggleOrderedList()`, `toggleTaskList()`
      - `sinkListItem()`, `liftListItem()`, `toggleTaskChecked(pos)`
      - 공통 도우미 `toggleList(listType, itemType)`의 동작
        - 같은 종류의 목록 안이면 해제한다.
        - 다른 종류의 목록 안이면 타입을 바꾼다. 단, task와 일반 목록 사이는 해제한 다음 다시 감싼다.
        - 목록 밖이면 감싼다.
    - 단축키: `Enter`는 split, `Tab`은 sink, `Shift-Tab`은 lift, `Mod-Shift-8`/`7`/`9`. priority는 200이다.
    - 입력 규칙: `^\s*([-+*])\s$`, `^(\d+)\.\s$`, `^\[( |x)?\]\s$`
  - `horizontalRule`
    - `hr` 노드, 명령 `insertHorizontalRule()`
    - 입력 규칙 `^(?:---|___|\*\*\*)$`: 해당 문단을 hr로 바꾸고 뒤에 빈 문단을 만든다.
  - `align`
    - `globalAttributes` 대상은 `['paragraph','heading']`, 속성 `align`
    - 값은 `oneOf(['center','right','justify'])`이고, `left`는 `null`이다.
    - 출력은 `style="text-align:x"`다.
    - 명령 `setAlign(value | null)`, 단축키 `Mod-Shift-l`/`e`/`r`/`j`, UI는 dropdown이다.
  - `indent`
    - `globalAttributes` 속성 `indent`. 정수 0~`DEFAULTS.indent.max`(8)이고, 출력은 `data-indent`다.
    - 명령 `indent()`와 `outdent()`: 목록 안이면 sink/lift를 위임하고, 아니면 attr을 ±1 한다. 범위를 벗어나면 false다.
    - 단축키 `Mod-]`, `Mod-[`
  - `placeholder`: 문서가 비어 있으면 첫 문단에 클래스 `le-placeholder`와 `data-placeholder`(`config.placeholder ?? t('placeholder')`) 데코레이션을 단다.
  - 언어팩 키: `toolbar.{heading,heading.paragraph,heading.h1..h4,blockquote,bulletList,orderedList,taskList,horizontalRule,align,align.left,align.center,align.right,align.justify,indent,outdent}`, `a11y.taskCheckbox`
- `blocks.html` 픽스처 내용

```
<h2>a</h2>
<blockquote><p>a</p></blockquote>
<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>
<ol start="3"><li><p>a</p></li></ol>
<ul data-type="taskList"><li data-checked="true"><p>a</p></li></ul>
<hr>
<p style="text-align:center" data-indent="2">a</p>
```

- [ ] **Step 1: 실패하는 테스트**

```ts
it.each([['## ', 'h2'], ['> ', 'blockquote'], ['- ', 'ul'], ['1. ', 'ol'], ['[] ', 'ul[data-type="taskList"]']])
  ('input rule "%s" creates %s', (input, sel) => { const ed = makeEditor(); typeText(ed, input + 'x'); expect(ed.view.dom.querySelector(sel)).not.toBeNull(); });
it('--- becomes an hr followed by a paragraph', () => { const ed = makeEditor(); typeText(ed, '---'); expect(ed.getHTML()).toBe('<hr><p></p>'); });
it('toggleHeading twice returns to paragraph', /* '<p>a</p>' → h1 → p */);
it('parses h5 as the last level', () => expect(makeEditor({ content: '<h5>a</h5>' }).getHTML()).toBe('<h4>a</h4>'));
it('toggleBulletList inside an ordered list converts it', /* ol → ul */);
it('indent nests list items and indents paragraphs up to max', () => {
  const ed = makeEditor({ content: '<p>a</p>' });
  for (let i = 0; i < 8; i++) expect(ed.exec('indent')).toBe(true);
  expect(ed.exec('indent')).toBe(false); expect(ed.getHTML()).toBe('<p data-indent="8">a</p>');
});
it('setAlign left clears the style', /* center → left → '<p>a</p>' */);
it('shows the placeholder only when empty', /* 빈 문서: .le-placeholder 존재, 입력 후 없음 */);
```

- [ ] **Step 2:** `npx vitest run tests/unit/extensions/blocks.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현하고 `getDefaultExtensions()`에 추가한다.
- [ ] **Step 4:** `npx vitest run tests/unit`을 실행한다. Expected: 전부 PASS
- [ ] **Step 5: 커밋** `feat(blocks): add heading, quote, lists, hr, align, indent, placeholder`

---

### Task 8: 붙여넣기 파이프라인

**Files:**
- Create: `src/io/paste/{pipeline.ts,dom.ts}`, `src/io/paste/cleaners/{cleanWord.ts,cleanHwp.ts,unwrapGoogleDocs.ts,normalizeStyles.ts}`, `src/extensions/base/clipboard.ts`
- Modify: `src/extensions/index.ts`, `src/core/defaults.ts`
- Create: 픽스처 `tests/fixtures/paste/<name>.html`과 `<name>.expected.html` 쌍
  - `word-list-nested`, `word-formatting`, `hwp-basic`, `gdocs-basic`, `web-article`
- Test: `tests/unit/io/paste.test.ts`

**Interfaces:**
- Produces:
  - `type PasteCleaner = (html: string) => string`
  - `class PastePipeline { constructor(cleaners: PasteCleaner[]); run(html: string): string }`
  - `withDocument(html: string, mutate: (doc: Document) => void): string`: 모든 정리 함수가 이 도우미 하나를 쓴다.
  - `cleanWord`
    - Word 판정: `urn:schemas-microsoft-com:office`나 `class="Mso`가 있을 때만 동작한다.
    - 주석, `o:p`, `style`, `meta`, `xml`, `link`를 제거한다.
    - `mso-list:lX levelN` 문단을 중첩 `ul`/`ol`로 바꾼다. 앞 기호가 `^\d+[.)]`이면 `ol`이다.
    - `mso-` 스타일을 제거한다.
  - `cleanHwp`
    - 한글 판정: `class="HStyle`나 `<!--StartFragment-->`, 또는 `font-family`에 `함초롬`이 있을 때만 동작한다.
    - `class`, StartFragment 주석, `font-family`/`line-height`/`letter-spacing`/`margin`/`text-indent` 스타일을 제거한다.
    - 실제 한글 프로그램 클립보드 샘플을 얻으면 픽스처를 교체한다.
  - `unwrapGoogleDocs`
    - `b[id^=docs-internal-guid]` 래퍼를 벗긴다.
    - `span`의 `font-weight:700`/`font-style:italic`/`underline`/`line-through` 스타일을 각각 `strong`/`em`/`u`/`s` 태그로 바꾼다.
  - `normalizeStyles`
    - `DEFAULTS.paste.keepStyles = ['color','background-color','text-align']`에 있는 스타일만 남긴다.
    - `DEFAULTS.paste.keepDataAttrs = ['data-type','data-checked','data-indent','data-align','data-video','data-provider','data-id']`에 없는 `class`, `id`, `data-*`는 제거한다.
  - `clipboard.ts` 확장
    - 플러그인 props `transformPastedHTML`이 `PastePipeline`을 실행한다. 순서는 위 4개 다음에 `manager.pasteCleaners()`다.
    - 예외가 나면 `PASTE_FAILED`를 report하고, 텍스트만 뽑아 `<p>`로 감싼 HTML을 반환한다.
    - `clipboardTextParser`: 빈 줄은 문단을 나누고, 한 줄바꿈은 `hardBreak`가 된다.

- [ ] **Step 1: 실패하는 테스트**

```ts
it.each(['word-list-nested', 'word-formatting', 'hwp-basic', 'gdocs-basic', 'web-article'])('paste fixture %s', name => {
  const ed = makeEditor(); ed.view.pasteHTML(read(`${name}.html`)); expect(ed.getHTML()).toBe(read(`${name}.expected.html`).trim());
});
it('keeps nested Word list levels', () => { const ed = makeEditor(); ed.view.pasteHTML(read('word-list-nested.html'));
  expect(ed.view.dom.querySelector('ul ul, ol ol, ul ol, ol ul')).not.toBeNull(); });
it('splits plain text into paragraphs and breaks', () => { const ed = makeEditor(); ed.view.pasteText('a\n\nb\nc'); expect(ed.getHTML()).toBe('<p>a</p><p>b<br>c</p>'); });
it('falls back to plain text when a cleaner throws', () => {
  const bad = defineExtension({ name: 'bad', pasteCleaners: [() => { throw new Error('x'); }] });
  const onError = vi.fn(); const ed = makeEditor({ extensions: [bad] }); ed.on('error', onError);
  ed.view.pasteHTML('<p><b>a</b></p>'); expect(ed.getHTML()).toBe('<p>a</p>');
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'PASTE_FAILED' }));
});
it('runs cleaners in order', /* PastePipeline([a,b]).run → b(a(x)) */);
```

- [ ] **Step 2:** `npx vitest run tests/unit/io/paste.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다. 픽스처 입력은 실제 프로그램이 클립보드에 넣는 HTML 형태를 재현해서 작성한다. `.expected.html`은 의도한 결과로 직접 작성한다. 구현 결과를 복사해서 만들지 않는다.
- [ ] **Step 4:** `npx vitest run tests/unit`을 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(io): add paste cleanup pipeline for Word, HWP, Google Docs`

---

### Task 9: UI 기반

**Files:**
- Create (`src/ui/`): `classes.ts`, `dom.ts`, `UIComponent.ts`, `icons.ts`, `icon-set.ts`, `shortcut.ts`, `roving.ts`, `focus.ts`, `device.ts`, `theme.ts`, `PanelHost.ts`, `Dropdown.ts`, `Toast.ts`, `presets.ts`
- Create (`src/themes/`): `tokens.css`, `editor.css`, `content.css`
- Test: `tests/unit/ui/{dom,component,icons,shortcut,roving,device,theme,panel-host,toast,presets}.test.ts`

**Interfaces:**
- Produces:
  - `c(...names: string[]): string`: `c('toolbar','active')`는 `'le-toolbar le-active'`이다.
  - `PORTAL_CLASS = c('portal')`
  - `h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: { class?: string; attrs?: Record<string, string | boolean | null>; on?: Partial<Record<keyof HTMLElementEventMap, EventListener>>; style?: Partial<CSSStyleDeclaration> }, ...children: Array<Node | string | null | false>): HTMLElementTagNameMap[K]`
  - `abstract class UIComponent<E extends HTMLElement = HTMLElement>`
    - `constructor(protected editor: Editor, readonly el: E)`
    - `protected listen(target, type, fn, opts?)`
    - `protected subscribe(event, fn)`
    - `update(): void`
    - `destroy(): void`: 등록한 리스너와 구독을 전부 해제하고 `el.remove()`
  - `registerIcon(name: string, icon: string | IconNode): void`
  - `renderIcon(name: string): SVGElement`
    - 모르는 이름이면 `circle-help` 아이콘을 쓰고, 이름당 한 번만 `console.warn`한다.
    - 기본 아이콘 매핑은 `icon-set.ts`에 lucide에서 import한 것만 둔다.
  - `formatShortcut(spec: string, isMac: boolean): string`: `'Mod-Shift-b'`는 Mac에서 `'⌘⇧B'`, 그 외에서 `'Ctrl+Shift+B'`이다.
  - `class RovingFocus { constructor(container: HTMLElement, itemSelector: string, orientation?: 'horizontal' | 'vertical'); refresh(): void; destroy(): void }`: 화살표 키, Home, End로 이동한다.
  - `trapFocus(container: HTMLElement): () => void`
  - `class DeviceWatcher { constructor(container: HTMLElement, breakpoint: number); readonly mode: DeviceMode; onChange(fn: (m: DeviceMode) => void): () => void; destroy(): void }`: `(pointer: coarse)`이면서 컨테이너 폭이 `breakpoint` 이하면 `mobile`이다.
  - `class ViewportTracker { readonly bottomInset: number; onChange(fn): () => void; destroy(): void }`
    - `bottomInset = max(0, innerHeight - (vv.height + vv.offsetTop))`
    - `visualViewport`가 없으면 항상 0이다.
  - `class ThemeController { constructor(getTargets: () => HTMLElement[], mode: ThemeMode); set(mode: ThemeMode): void; readonly resolved: 'light' | 'dark'; destroy(): void }`
  - `type PanelFactory = (ctx: PanelContext) => HTMLElement`
  - `interface PanelContext { editor: Editor; t: Translate; close(): void }`
  - `interface PanelContainer { open(content: HTMLElement, anchor: HTMLElement | null, onClose: () => void): void; close(): void; readonly isOpen: boolean; destroy(): void }`
  - `class Dropdown implements PanelContainer`
    - `document.body`의 `PORTAL_CLASS` 요소 안에 띄운다. `role="dialog"`이고 `data-theme`을 복사한다.
    - 위치는 floating-ui `computePosition`과 `autoUpdate`로, `placement 'bottom-start'`, `flip`, `shift`를 쓴다.
    - `Esc`나 바깥 `pointerdown`이면 닫는다. 열릴 때 `trapFocus`를 건다.
  - `class PanelHost { constructor(editor: Editor, getMode: () => DeviceMode); openPanel(factory: PanelFactory, anchor?: HTMLElement | null): void; close(): void; readonly isOpen: boolean; destroy(): void }`
    - 이 태스크에서는 항상 Dropdown을 쓴다. Task 21에서 모바일이면 BottomSheet를 쓰게 바꾼다.
    - 닫히면 `editor.focus()`를 호출한다.
  - `class Toaster { constructor(host: HTMLElement); show(message: string, kind?: 'info' | 'error'): void; destroy(): void }`: `role="status"`이고 `DEFAULTS.toast.duration` 뒤에 제거한다.
  - `presets.ts`
    - `PRESETS = { basic, full }`: 값은 스펙 4.5다.
    - `full`의 순서: `undo, redo, |, heading, |, bold, italic, underline, strike, code, textColor, highlight, clearFormat, |, align, indent, outdent, |, bulletList, orderedList, taskList, |, link, image, video, table, blockquote, codeBlock, horizontalRule, |, findReplace, sourceView, fullscreen`
    - `type PresetName`, `SEPARATOR = '|'`
    - `BUBBLE_ITEMS = ['bold','italic','underline','strike','link','textColor','highlight']`
- CSS
  - `tokens.css`
    - 대상 선택자는 `:where(.le-editor, .le-portal)`이다.
    - 정의할 변수: `--le-color-{bg,fg,muted,border,primary,primary-fg,hover,active,danger}`, `--le-radius`, `--le-font`, `--le-font-mono`, `--le-toolbar-height`, `--le-touch-target: 44px`, `--le-z-overlay`, `--le-z-fullscreen`
    - `[data-theme=dark]`에서 색상 변수를 재정의한다.
    - 두 테마 모두 본문과 배경 대비 4.5:1 이상이어야 한다.
  - `content.css`: `.le-prose`의 본문 요소 스타일(제목, 목록, 인용, 표, figure, pre, hr, `data-indent` 단계별 여백, `.le-video` 16:9)
  - `editor.css`: UI 스타일
  - 수치는 모두 변수로 쓴다.

- [ ] **Step 1: 실패하는 테스트** (파일별 핵심 단언)

```ts
it('h builds element with class, attrs, listeners, children', /* class, aria-label, click 호출, 자식 텍스트 */);
it('UIComponent.destroy removes listeners and subscriptions', /* destroy 후 이벤트 → 핸들러 미호출 */);
it('renderIcon falls back and warns once for unknown names');
it.each([['Mod-Shift-b', true, '⌘⇧B'], ['Mod-Shift-b', false, 'Ctrl+Shift+B'], ['Mod-Alt-1', false, 'Ctrl+Alt+1']])('formatShortcut %s', (s, mac, out) => expect(formatShortcut(s, mac)).toBe(out));
it('RovingFocus moves with arrows and Home/End');
it('DeviceWatcher reports mobile for coarse pointer and narrow container, and notifies changes');
it('ThemeController auto follows prefers-color-scheme changes on all targets');
it('PanelHost opens a dialog in a portal, closes on Escape and outside pointerdown, returns focus to the editor');
it('Toaster announces with role=status and removes after duration');
it('presets have unique ids and full contains basic', () => {
  for (const ids of Object.values(PRESETS)) { const real = ids.filter(i => i !== SEPARATOR); expect(new Set(real).size).toBe(real.length); }
  expect(PRESETS.basic.filter(i => i !== SEPARATOR).every(i => PRESETS.full.includes(i))).toBe(true);
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/ui`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 같은 명령을 다시 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(ui): add UI foundation, panels, theme and presets`

---

### Task 10: 툴바, EditorUI, 기본 패널, 데모, E2E 기반

**Files:**
- Create: `src/ui/{EditorUI.ts,Toolbar.ts,controls.ts}`, `src/ui/panels/{colorPanel.ts,linkPanel.ts,listPanel.ts}`
- Modify: `src/core/Editor.ts` (UI 생성, `setTheme`, `setLocale`), `src/extensions/marks/{colorMark.ts,link.ts}` (패널 연결), `src/i18n/{ko,en}.ts`
- Create: `demo/index.html`, `demo/main.ts`, `playwright.config.ts`, `tests/e2e/{basic.spec.ts,ime.spec.ts,textarea.spec.ts,theme.spec.ts}`
- Test: `tests/unit/ui/{toolbar,editor-ui,panels}.test.ts`

**Interfaces:**
- Consumes: Task 9 전부, Task 3의 UI 레지스트리
- Produces:
  - `class EditorUI`
    - `constructor(editor: Editor)`
    - 속성: `panels: PanelHost`, `toaster: Toaster`, `device: DeviceWatcher`, `theme: ThemeController`, `registry: Map<string, UIItem>`
    - `openPanelFor(itemId: string, anchor?: HTMLElement | null): void`
    - `getContext(): UIContext`: Task 14 전까지는 항상 `'text'`
    - `toolbarItems(): Array<UIItem | typeof SEPARATOR>`
      - 명시한 `toolbar` 배열이 있으면 엄격 모드다. 모르는 ID는 `UNKNOWN_UI_ITEM`을 경고하고 사용 가능한 ID 목록을 같이 출력한다.
      - 프리셋이면 모르는 ID를 조용히 건너뛴다.
    - `flush(): void`: 묶어 둔 갱신을 즉시 실행한다. 테스트용이다.
    - `destroy(): void`
    - 슬롯 컨테이너: `.le-top`(툴바와 top 슬롯), `.le-status`, overlay는 포털이다.
    - `update` 이벤트를 받으면 `rafBatch`로 모든 컴포넌트의 `update()`를 호출한다.
    - 확장의 `components()`를 각 슬롯에 마운트한다.
  - `controls.ts`
    - `createControl(item: UIItem, editor: Editor, ui: EditorUI): HTMLElement`
      - 종류별 동작
        - `button`: `exec`를 실행한다.
        - `dropdown`: `listPanel`로 `item.options`를 보여준다.
        - `panel`: `item.panel`을 연다.
      - 공통 속성: `aria-label=t(label)`, `data-tooltip=t(label) + formatShortcut`, `aria-pressed`
      - `pointerdown` 기본 동작을 막아서 에디터 포커스를 유지한다.
    - `syncControl(el: HTMLElement, item: UIItem, editor: Editor): void`
    - Toolbar, ContextToolbar, BubbleMenu, 모바일 툴바가 모두 이 두 함수를 쓴다.
  - `class Toolbar extends UIComponent<HTMLDivElement>`
    - `constructor(editor, ui, items)`
    - `role=toolbar`, `aria-label=t('a11y.toolbar')`, `RovingFocus`를 단다.
    - 넘침 처리: `ResizeObserver`로 감지한다. 항목의 `offsetWidth` 합이 `clientWidth - more버튼폭`을 넘으면 뒤쪽 항목부터 `⋯`(`toolbar.more`) 패널로 옮긴다.
  - 패널
    - `colorPanel(paletteKey, command, unsetCommand): PanelFactory`
    - `linkPanel: PanelFactory`: URL 입력, 새 탭 체크, 적용, 제거. `Enter`로 적용한다.
    - `listPanel(items: UIItem[]): PanelFactory`: dropdown 옵션 목록이고 `⋯` 넘침 메뉴에도 쓴다.
  - `Editor.setTheme(mode)`는 `ui.theme.set`을 호출한다.
  - `Editor.setLocale(locale)`는 `t`를 교체하고 `ui`를 destroy한 뒤 다시 만든다.
- 데모(`demo/main.ts`)
  - `#editor`에 `full` 프리셋 에디터를 만든다.
  - `window.__editor`로 노출한다.
  - 컨트롤: 테마 전환 버튼, 언어 전환 버튼, `getHTML` 출력 영역, "5만 자 샘플" 버튼
  - textarea 폼 섹션(`#form`, `textarea[name=body]`): submit하면 `#form-output`에 FormData 값을 표시하고 기본 동작을 막는다.
  - 두 번째 에디터 `#editor-2`(basic 프리셋)를 두어 다중 인스턴스를 검증한다.
- `playwright.config.ts`
  - `webServer`: `npm run dev -- --port 5173 --strictPort`, `baseURL: http://localhost:5173/demo/`
  - projects
    - `desktop-chromium`: `devices['Desktop Chrome']`
    - `mobile-chromium`: `devices['Pixel 7']`
    - `mobile-webkit`: `devices['iPhone 14']`. `E2E_WEBKIT`가 설정됐을 때만 포함한다.
- 언어팩 키: `toolbar.more`, `panel.link.*`, `panel.color.*`, `a11y.*`
- 이 태스크까지의 모든 툴바 레이블에 ko와 en 문구를 채운다.

- [ ] **Step 1: 실패하는 단위 테스트**

```ts
it('renders preset items in order with separators and labels', () => {
  const ed = makeEditor({ preset: 'basic' });
  const ids = [...ed.root.querySelectorAll('.le-toolbar [data-item], .le-toolbar .le-separator')].map(e => (e as HTMLElement).dataset.item ?? '|');
  expect(ids).toEqual(PRESETS.basic.filter(id => id === '|' || id !== 'image')); // image는 Task 11 이전엔 미등록
});
it('clicking bold toggles and syncs aria-pressed', () => {
  const ed = makeEditor({ content: '<p>a</p>' }); selectText(ed, 'a');
  const btn = ed.root.querySelector<HTMLButtonElement>('[data-item="bold"]')!; btn.click(); ed.ui!.flush();
  expect(ed.getHTML()).toBe('<p><strong>a</strong></p>'); expect(btn.getAttribute('aria-pressed')).toBe('true');
});
it('pointerdown on a control is prevented to keep focus', /* dispatch pointerdown → defaultPrevented */);
it('warns UNKNOWN_UI_ITEM listing valid ids for an explicit toolbar', /* console.warn에 'bold' 포함 */);
it('moves overflowing items into the more menu', /* offsetWidth 40 스텁, clientWidth 200 → 일부가 ⋯ 패널로 */);
it('heading dropdown applies H2', /* openPanelFor('heading') → 옵션 클릭 → '<h2>a</h2>' */);
it('color panel applies and resets a color', /* 팔레트 첫 색 클릭 → span style, reset → 원복 */);
it('Mod-k opens the link panel and Enter applies', /* 입력 'https://a.com' + Enter → a 태그 */);
it('two editors are independent; destroying one keeps the other working', () => {
  const a = makeEditor({ content: '<p>a</p>' }); const b = makeEditor({ content: '<p>b</p>' });
  a.destroy(); selectText(b, 'b'); b.root.querySelector<HTMLButtonElement>('[data-item="bold"]')!.click(); b.ui!.flush();
  expect(b.getHTML()).toBe('<p><strong>b</strong></p>'); expect(document.querySelectorAll('.le-editor')).toHaveLength(1);
});
it('setLocale rebuilds labels', /* en으로 바꾸면 bold aria-label 'Bold' */);
```

- [ ] **Step 2:** `npx vitest run tests/unit/ui`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npx vitest run tests/unit`을 실행한다. Expected: PASS
- [ ] **Step 5: E2E 작성**

```ts
// ime.spec.ts — Chromium 전용(test.skip(browserName !== 'chromium'))
async function compose(page, steps: string[], commit: string) {
  const cdp = await page.context().newCDPSession(page);
  for (const s of steps) await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
  await cdp.send('Input.insertText', { text: commit });
}
test('composes Korean without loss', async ({ page }) => {
  await page.goto('./'); await page.click('#editor .ProseMirror');
  await compose(page, ['ㅎ', '하', '한'], '한'); await compose(page, ['ㄱ', '그', '글'], '글'); await page.keyboard.type('a');
  expect(await page.evaluate(() => window.__editor.getHTML())).toBe('<p>한글a</p>');
});
test('composes Korean right after the "# " rule and inside bold', /* '# ' 후 조합 → '<h1>한</h1>'; Mod-b 후 조합 → '<p><strong>한</strong></p>' */);
// basic.spec.ts: 툴바 굵게 버튼과 Mod-b, 링크 패널
// textarea.spec.ts: 입력 → submit → #form-output이 '<p>…</p>'
// theme.spec.ts: 테마 버튼 → .le-editor의 data-theme="dark", 배경색 변수 값이 바뀜
```

  - Run: `npx playwright test`
  - Expected: `desktop-chromium`과 `mobile-chromium`에서 전부 PASS

- [ ] **Step 6: 커밋하고 M1 push**
  - 커밋 `feat(ui): add toolbar, panels, demo page and e2e harness`
  - 그다음 `git push -u origin claude/lay-editor-v1`

---

# M2 미디어와 표

### Task 11: 이미지와 업로드

**Files:**
- Create: `src/extensions/media/{image.ts,ImageView.ts}`, `src/io/upload.ts`, `src/ui/panels/imagePanel.ts`, `demo/upload-plugin.ts`
- Modify: `vite.config.ts` (데모 업로드 플러그인 등록), `demo/main.ts` (`upload` 연결), `src/extensions/index.ts`, `src/core/defaults.ts`, `src/i18n/{ko,en}.ts`
- Create: `tests/fixtures/roundtrip/media.html`
- Test: `tests/unit/extensions/image.test.ts`, `tests/unit/io/upload.test.ts`, `tests/e2e/image.spec.ts`

**Interfaces:**
- Produces:
  - 노드 `image`
    - 기본 속성: `group: 'block'`, `content: 'text*'`, `marks: ''`, `draggable`, `isolating`
    - attrs: `src`, `alt('')`, `width(null | number)`, `align('center')`, `uploadId(null)`
    - `toDOM`: `['figure', { 'data-align': align, style: width ? 'width:'+width+'%' : null }, ['img', { src, alt }], ['figcaption', 0]]`
      - 스펙 8.1은 width를 img에 두지만, 캡션 폭을 이미지와 맞추려고 figure로 옮긴다.
    - `parseDOM`
      - `figure`: img의 `src`를 `safeUrl(allowDataImage)`, `data-align`을 `oneOf`, width를 `clampWidth`로 검증한다. `contentElement: 'figcaption'`
      - 단독 `img`
    - `transient: n => n.attrs.uploadId != null`
  - `ImageView`
    - `contentDOM`은 figcaption이다. 비어 있으면 `data-placeholder=t('panel.image.caption')`을 단다.
    - 모서리 핸들(`.le-resize-handle`)을 드래그하면 콘텐츠 폭 대비 %를 계산해 `setImageWidth`를 호출한다.
    - `uploadId`가 있으면 `.le-uploading` 클래스와 진행 막대를 붙이고 `UploadManager.onProgress`를 구독한다.
  - 명령
    - `insertImage({ src, alt? })`
    - `setImageWidth(percent | null)`
    - `setImageAlign(align)`
    - `setImageAlt(alt)`
    - `deleteImage()`
    - `uploadImages(files: File[], pos?: number)`
    - `openImagePanel()`
  - UI 항목
    - `image`: panel 종류, contexts `['text']`, 슬래시 키워드 `['image','이미지','사진']`
    - 이미지 상황 전용(contexts `['image']`)
      - `imageWidth25`, `imageWidth50`, `imageWidth75`, `imageWidth100`: `DEFAULTS.image.widths`로 생성한다.
      - `imageAlignLeft`, `imageAlignCenter`, `imageAlignRight`
      - `imageAlt`(panel), `imageDelete`
  - `class UploadManager`
    - `constructor(editor: Editor, opts: { upload: UploadFn | null; maxSize: number; accept: string[] })`
    - `validate(file: File): EditorError | null`: `UPLOAD_REJECTED`의 detail은 `'type'` 또는 `'size'`다.
    - `uploadFiles(files: File[], pos?: number): Promise<void>`
    - `adoptDataImages(view: EditorView): void`: `appendTransaction` 이후 호출한다. `data:` src를 File로 바꿔 업로드한다. `upload`가 없으면 해당 노드를 제거하고 `toast.uploadNotConfigured`를 띄운다.
    - `onProgress(fn: (id: string, ratio: number) => void): () => void`
    - `destroy(): void`: objectURL을 해제하고, 이후 완료되는 Promise는 무시한다.
  - 흐름은 스펙 8.4를 따른다. 결과로 교체하는 트랜잭션에는 `addToHistory: false` 메타를 단다.
  - `DEFAULTS.image`에 추가하는 값: `maxSize: 10*1024*1024`, `accept: DEFAULTS.url.dataImageTypes`, `widths: [25,50,75,100]`
  - `demo/upload-plugin.ts`
    - `POST /__upload`는 메모리에 저장하고 `{ url: '/__uploads/<id>' }`를 반환한다.
    - `GET /__uploads/<id>`는 저장한 파일을 돌려준다.
    - `?fail=1` 쿼리가 있으면 500을 반환한다(E2E용).
  - 언어팩 키: `toolbar.image*`, `panel.image.{file,url,alt,caption,insert}`, `toast.{uploadFailed,uploadTooLarge,uploadBadType,uploadNotConfigured}`
- `media.html` 픽스처: `<figure data-align="center" style="width:50%"><img src="https://x.com/a.png" alt="a"><figcaption>cap</figcaption></figure>`

- [ ] **Step 1: 실패하는 테스트**

```ts
const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' });
it('uploads: placeholder hidden from getHTML, then replaced without an undo step', async () => {
  let resolve!: (r: UploadResult) => void; const upload = vi.fn(() => new Promise<UploadResult>(r => { resolve = r; }));
  const ed = makeEditor({ upload }); const p = ed.exec('uploadImages', [png()]);
  expect(ed.getHTML()).toBe(''); resolve({ url: 'https://cdn/a.png' }); await flushPromises();
  expect(ed.getHTML()).toContain('src="https://cdn/a.png"'); ed.exec('undo'); expect(ed.getHTML()).toBe('');
});
it('emits uploadStart, uploadProgress and uploadSuccess in order', /* onProgress(0.5) 호출 → 이벤트 순서 */);
it('rejects too large or wrong type with UPLOAD_REJECTED and a toast', /* image: { maxSize: 1 } */);
it('removes the placeholder and emits uploadError(UPLOAD_FAILED) on failure', /* reject → '' + code UPLOAD_FAILED */);
it('ignores a result after destroy', async () => { /* 업로드 대기 중 destroy → resolve → 예외/dispatch 없음 */ });
it('ignores a result whose node the user deleted', /* 업로드 중 placeholder 삭제 → resolve → 문서 변화 없음 */);
it('uploads pasted data: images, or drops them with a toast when upload is missing', /* 두 경우 */);
it('setImageWidth clamps and width buttons exist for DEFAULTS.image.widths', /* 150 → 100, 버튼 4개 */);
it('rejects javascript: src on parse', () => expect(makeEditor({ content: '<img src="javascript:x">' }).getHTML()).toBe(''));
```

  - E2E(`image.spec.ts`)
    - 파일 선택(`setInputFiles`)으로 업로드하면 `/__uploads/` src가 들어간다.
    - `?fail=1` 모드에서는 토스트가 표시되고 이미지가 없다.

- [ ] **Step 2:** `npx vitest run tests/unit/extensions/image.test.ts tests/unit/io/upload.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다. 붙여넣기와 드롭은 플러그인 props `handlePaste`/`handleDrop`이 이미지 파일을 걸러 `uploadFiles`를 호출한다. `upload`가 없으면 토스트를 띄운다.
- [ ] **Step 4:** `npx vitest run tests/unit && npx playwright test tests/e2e/image.spec.ts`를 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(media): add image node with upload flow and resize`

---

### Task 12: 동영상 임베드

**Files:**
- Create: `src/extensions/media/{video.ts,video-providers.ts}`, `src/ui/panels/urlPanel.ts`
- Modify: `src/extensions/index.ts`, `src/core/defaults.ts`, `src/i18n/{ko,en}.ts`, `tests/fixtures/roundtrip/media.html`, `src/index.ts`
- Test: `tests/unit/extensions/video.test.ts`

**Interfaces:**
- Produces:
  - `interface VideoProvider { id: string; idPattern: RegExp; match(url: URL): string | null; embedUrl(id: string): string }`
  - `registerVideoProvider(p: VideoProvider): void`
  - `parseVideoUrl(url: string, allowed: string[]): { provider: string; id: string } | null`
  - 기본 제공자
    - `youtube`
      - 인식하는 호스트: `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be`, `www.youtube-nocookie.com`
      - 인식하는 경로: `/watch?v=`, `/embed/`, `/shorts/`, `youtu.be/<id>`
      - ID 패턴: `^[\w-]{11}$`
      - 임베드 주소: `https://www.youtube-nocookie.com/embed/<id>`
    - `vimeo`
      - 인식하는 주소: `vimeo.com/<digits>`, `player.vimeo.com/video/<digits>`
      - 임베드 주소: `https://player.vimeo.com/video/<id>`
  - `DEFAULTS.video = { providers: ['youtube','vimeo'] }`
  - 노드 `video`
    - block, atom
    - attrs: `provider`, `id`
    - `parseDOM`
      - `div[data-video]`: 등록된 제공자와 `idPattern`으로 검증한다.
      - `iframe[src]`: `parseVideoUrl`로 판정한다.
    - `toDOM`: `['div', { 'data-video': '', 'data-provider', 'data-id', class: c('video') }, ['iframe', { src: embedUrl(id), frameborder: '0', allowfullscreen: 'true', loading: 'lazy' }]]`
  - 명령 `insertVideo(url: string): boolean`: 허용 목록(`options.providers`)에 없으면 false다.
  - 붙여넣기: 빈 문단에 단일 행 URL을 붙여넣고 `parseVideoUrl`이 성공하면 video 노드를 삽입한다.
  - `urlPanel(labelKey, command): PanelFactory`: Task 11 이미지 패널의 URL 입력 부분도 이 함수를 재사용하도록 리팩터링한다.
  - UI 항목 `video`: panel 종류, 슬래시 키워드 `['video','youtube','동영상']`
- `media.html`에 추가하는 줄: `<div data-video="" data-provider="youtube" data-id="dQw4w9WgXcQ" class="le-video"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" frameborder="0" allowfullscreen="true" loading="lazy"></iframe></div>`

- [ ] **Step 1: 실패하는 테스트**

```ts
it.each([
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'], ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube'], ['https://vimeo.com/76979871', 'vimeo'],
])('parses %s', (url, provider) => expect(parseVideoUrl(url, ['youtube', 'vimeo'])?.provider).toBe(provider));
it.each(['https://evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'javascript:alert(1)'])('rejects %s', u => expect(parseVideoUrl(u, ['youtube', 'vimeo'])).toBeNull());
it('insertVideo respects video.providers', () => expect(makeEditor({ video: { providers: ['vimeo'] } }).exec('insertVideo', 'https://youtu.be/dQw4w9WgXcQ')).toBe(false));
it('auto-embeds a pasted lone URL', () => { const ed = makeEditor(); ed.view.pasteText('https://youtu.be/dQw4w9WgXcQ'); expect(ed.getHTML()).toContain('data-provider="youtube"'); });
it('drops iframes from unknown hosts', () => expect(makeEditor({ content: '<iframe src="https://evil.com/x"></iframe>' }).getHTML()).toBe(''));
```

- [ ] **Step 2:** `npx vitest run tests/unit/extensions/video.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다. `registerVideoProvider`를 `src/index.ts`에서 내보낸다.
- [ ] **Step 4:** `npx vitest run tests/unit`을 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(media): add video embeds with provider registry`

---

### Task 13: 표

**Files:**
- Create: `src/extensions/table/{table.ts,tablePanel.ts}`
- Modify: `src/extensions/index.ts`, `src/core/defaults.ts`, `src/themes/editor.css` (선택 셀, 열 너비 핸들), `src/i18n/{ko,en}.ts`
- Create: `tests/fixtures/roundtrip/table.html`
- Test: `tests/unit/extensions/table.test.ts`, `tests/e2e/table.spec.ts`

**Interfaces:**
- Produces:
  - 노드는 `prosemirror-tables`의 `tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: { background } })`로 만든다.
    - `background`: `getFromDOM`은 `safeColor(dom.style.backgroundColor)`, `setDOMAttr`는 `background-color:x;`를 style에 더한다.
  - 플러그인: `columnResizing()`, `tableEditing()`
  - 단축키: `Tab`/`Shift-Tab`은 `goToNextCell(±1)`, priority 300
  - 명령
    - `insertTable(rows = DEFAULTS.table.defaultRows, cols = DEFAULTS.table.defaultCols, withHeader = true)`
    - 행과 열: `addRowBefore`, `addRowAfter`, `addColumnBefore`, `addColumnAfter`, `deleteRow`, `deleteColumn`
    - 표와 셀: `deleteTable`, `mergeCells`, `splitCell`, `toggleHeaderRow`, `setCellBackground(color | null)`
  - UI 항목
    - `table`: panel 종류, 격자 선택기. 슬래시 키워드 `['table','표']`
    - 표 상황 전용(contexts `['table']`): `tableAddRowAfter`, `tableAddColumnAfter`, `tableDeleteRow`, `tableDeleteColumn`, `tableMerge`, `tableSplit`, `tableHeaderRow`, `tableCellColor`(panel, `colorPanel` 재사용), `tableDelete`
  - `tablePanel`
    - `DEFAULTS.table.maxGrid`(10)×10 격자다.
    - 마우스를 올리거나 포커스를 옮기면 크기 미리보기를 보여준다.
    - 키보드 화살표로 크기를 고르고 `Enter`로 삽입한다.
    - 칸 크기는 CSS 변수 `--le-grid-cell`이다.
  - `DEFAULTS.table = { maxGrid: 10, mobileMaxGrid: 6, defaultRows: 3, defaultCols: 3 }`
- `table.html` 픽스처: `<table><tbody><tr><th><p>a</p></th><th><p>b</p></th></tr><tr><td colspan="2" style="background-color:#ffec99;"><p>c</p></td></tr></tbody></table>`
  - 정확한 직렬화 형태는 prosemirror-tables 출력에 맞춘다. 픽스처는 1회 출력을 확인한 뒤 고정한다.

- [ ] **Step 1: 실패하는 테스트**

```ts
it('insertTable creates rows x cols with a header row', () => { const ed = makeEditor(); ed.exec('insertTable', 2, 3);
  expect(ed.view.dom.querySelectorAll('tr')).toHaveLength(2); expect(ed.view.dom.querySelectorAll('th')).toHaveLength(3); });
it('merges and splits a cell selection', /* CellSelection 2칸 → mergeCells → colspan="2" → splitCell → 원복 */);
it('adds and deletes rows and columns', /* 개수 변화 확인 */);
it('setCellBackground validates color', /* 'red' → false, '#ffec99' → style */);
it('Tab moves to the next cell', /* selection이 다음 td 안 */);
```

  - E2E(`table.spec.ts`)
    - 격자 패널로 3×3 표를 삽입한다.
    - 셀 2개를 드래그로 선택한 뒤 병합 버튼을 누르면 `colspan`이 생긴다.
    - 셀 안에서 한글을 조합해도 손실이 없다(Chromium). Review Focus 1번에 해당한다.

- [ ] **Step 2:** `npx vitest run tests/unit/extensions/table.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npx vitest run tests/unit && npx playwright test tests/e2e/table.spec.ts`를 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(table): add tables with merge, resize and cell color`

---

### Task 14: 상황 판단과 ContextToolbar

**Files:**
- Create: `src/ui/context.ts`, `src/ui/ContextToolbar.ts`
- Modify: `src/ui/EditorUI.ts` (`getContext`, ContextToolbar 마운트), `src/extensions/marks/link.ts` (링크 상황 항목)
- Test: `tests/unit/ui/context.test.ts`, `tests/unit/ui/context-toolbar.test.ts`

**Interfaces:**
- Produces:
  - `resolveContext(state: EditorState): UIContext`: 판단 순서는 스펙 7.4를 따른다.
  - `contextAnchor(view: EditorView, ctx: UIContext): HTMLElement | null`
    - `image`면 `nodeDOM`
    - `table`이면 가장 가까운 `table`
    - `codeBlock`이면 `pre`
    - `link`면 커서 위치의 `a`
  - `contextOnlyItems(registry, ctx): UIItem[]`: `contexts`에 `ctx`가 있고 `'text'`는 없는 항목이다.
  - `class ContextToolbar extends UIComponent`
    - 데스크톱 전용이다. 상황이 `text`가 아니고 `contextOnlyItems`가 하나 이상일 때만 표시한다.
    - floating-ui로 앵커 위쪽(`top`, `flip`)에 띄운다.
    - 컨트롤은 `controls.ts`로 만든다.
  - 링크 상황 항목(contexts `['link']`)
    - `linkEdit`: panel. `linkPanel`을 재사용하고 현재 값을 채운다.
    - `linkOpen`: `window.open(href, '_blank', 'noopener')`
    - `linkRemove`

- [ ] **Step 1: 실패하는 테스트**

```ts
it.each([
  ['<figure data-align="center"><img src="https://x/a.png" alt=""><figcaption></figcaption></figure>', 'node:0', 'image'],
  ['<table><tbody><tr><td><p>a</p></td></tr></tbody></table>', 'text:a', 'table'],
  ['<p><a href="https://a.com">a</a></p>', 'text:a', 'link'], ['<p>a</p>', 'text:a', 'text'],
])('resolveContext(%s) → %s', (html, sel, ctx) => { const ed = makeEditor({ content: html }); select(ed, sel); expect(resolveContext(ed.state)).toBe(ctx); });
it('ContextToolbar shows only context items for an image and hides for text', /* imageWidth50 존재, bold 없음; text로 이동 시 hidden */);
```

- [ ] **Step 2:** `npx vitest run tests/unit/ui/context*.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npx vitest run tests/unit`을 실행한다. Expected: PASS
- [ ] **Step 5: 커밋하고 M2 push**
  - 커밋 `feat(ui): add context resolution and context toolbar`
  - 그다음 `git push -u origin claude/lay-editor-v1`

---

# M3 편의 기능

### Task 15: 슬래시 메뉴

**Files:**
- Create: `src/extensions/tools/slashMenu.ts`, `src/ui/SlashMenu.ts`
- Modify: `src/extensions/index.ts`, `src/core/defaults.ts`, `src/i18n/{ko,en}.ts`
- Test: `tests/unit/extensions/slash.test.ts`, `tests/e2e/slash.spec.ts`

**Interfaces:**
- Produces:
  - `export const slashKey: PluginKey<SlashState>`
  - 플러그인 상태 `SlashState = { active: boolean; from: number; query: string; index: number }`
    - 활성 조건: 텍스트블록 시작이나 공백 바로 뒤에서 `/`를 입력했을 때
    - 비활성 조건: 공백이 든 query에 매칭이 0개일 때, `Esc`, 선택이 범위를 벗어났을 때, 코드블록 안
  - `filterSlashItems(items: UIItem[], query: string, t: Translate): UIItem[]`
    - `t(label)`과 `slash.keywords`를 대상으로 대소문자 무시 부분일치 검색을 한다.
    - 결과는 최대 `DEFAULTS.slash.maxItems`(10)개다.
  - 키 처리: 활성 상태에서 `ArrowUp`/`ArrowDown`/`Enter`/`Tab`/`Escape`를 `handleKeyDown`으로 받는다.
  - 실행할 때 `/query` 범위를 지운 뒤 항목의 명령을 `exec`하거나 패널을 연다.
  - `SlashMenu`
    - 컴포넌트 슬롯은 `overlay`다.
    - 위치는 `view.coordsAtPos(from)` 가상 요소를 기준으로 floating-ui로 잡는다.
    - `role="listbox"`이고 활성 항목에 `aria-activedescendant`를 단다.
  - 언어팩 키: `slash.empty`(일치하는 항목이 없습니다)

- [ ] **Step 1: 실패하는 테스트**

```ts
it('opens on "/" at line start and filters by Korean keyword', () => { const ed = makeEditor(); typeText(ed, '/표');
  expect(slashKey.getState(ed.state)!.active).toBe(true); expect(visibleItemIds(ed)).toEqual(['table']); });
it('does not open mid-word', () => { const ed = makeEditor(); typeText(ed, 'a/'); expect(slashKey.getState(ed.state)!.active).toBe(false); });
it('Enter runs the item and removes the query', () => { const ed = makeEditor(); typeText(ed, '/h2'); press(ed, 'Enter'); expect(ed.getHTML()).toBe('<h2></h2>'); });
it('Escape closes and keeps the text', /* '/ab' Esc → '<p>/ab</p>' */);
```

  - E2E(`slash.spec.ts`): `/` 입력, 화살표 키 2회, Enter를 거쳐 해당 블록이 삽입된다.

- [ ] **Step 2:** `npx vitest run tests/unit/extensions/slash.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npx vitest run tests/unit && npx playwright test tests/e2e/slash.spec.ts`를 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(tools): add slash menu`

---

### Task 16: 코드블록과 지연 하이라이트

**Files:**
- Create: `src/extensions/blocks/codeBlock.ts`, `src/extensions/blocks/codeHighlight.ts`
- Modify: `src/extensions/index.ts`, `src/core/defaults.ts`, `src/themes/{editor.css,content.css}`, `src/i18n/{ko,en}.ts`, `tests/fixtures/roundtrip/blocks.html`
- Test: `tests/unit/extensions/code-block.test.ts`

**Interfaces:**
- Produces:
  - `codeBlock`
    - `blockExtension({ kind: 'textblock', tag: 'pre', content: 'text*', marks: '', code: true, defining: true, attrs: { language: { default: null } } })`
    - parse: `code[class^=language-]`의 언어를 `safeLanguage`로 검증한다.
    - `toDOM`: `['pre', ['code', { class: language ? 'language-'+language : null }, 0]]`
    - 입력 규칙 ```` ^```([a-z0-9+#-]*)\s$ ````
    - 단축키
      - `Mod-Alt-c`: toggle
      - 블록 안에서 `Tab`: `DEFAULTS.codeBlock.indent`(`'  '`)를 삽입
      - 블록 안에서 `Mod-Enter`: `exitCode`
    - 명령 `setCodeLanguage(lang | null)`
    - UI 항목
      - `codeBlock`: 버튼, 슬래시 키워드 `['code','코드']`
      - `codeLanguage`: contexts `['codeBlock']` dropdown. 옵션은 `options.languages`로 만든다.
  - `DEFAULTS.codeBlock = { indent: '  ', languages: ['plaintext','javascript','typescript','html','css','json','python','java','sql','bash'] }`
  - `codeHighlight.ts`
    - `createHighlightPlugin(load: () => Promise<Highlighter>): Plugin`
      - 문서에 codeBlock이 처음 생기면 `load()`를 1회 호출한다.
      - 로드가 끝나면 meta 트랜잭션으로 데코레이션을 다시 계산한다.
      - 바뀐 블록만 다시 계산한다.
      - 로드가 끝났을 때 view가 destroy됐으면 아무것도 하지 않는다.
    - `type Highlighter = (code: string, language: string | null) => Array<{ from: number; to: number; className: string }>`
    - 기본 `load`: `import('lowlight')`로 `createLowlight(common)`을 만들고 hast 트리를 범위 배열로 바꾼다. 언어가 `null`이면 `highlightAuto`를 쓰지 않고 빈 배열을 반환한다.
- `blocks.html`에 추가하는 줄: `<pre><code class="language-js">const a = 1;</code></pre>`, `<pre><code>x</code></pre>`

- [ ] **Step 1: 실패하는 테스트.** `load`는 가짜 하이라이터로 주입한다.

```ts
it('``` + space creates a code block with language', () => { const ed = makeEditor(); typeText(ed, '```js '); expect(ed.getHTML()).toBe('<pre><code class="language-js"></code></pre>'); });
it('loads the highlighter once, lazily, and decorates', async () => {
  const load = vi.fn(async () => (code: string) => [{ from: 0, to: 5, className: 'hljs-keyword' }]);
  const testHighlight = defineExtension({ name: 'testHighlight', plugins: () => [createHighlightPlugin(load)] });
  const ed = makeEditor({ extensions: [testHighlight], disable: ['codeHighlight'] });
  expect(load).not.toHaveBeenCalled(); ed.exec('toggleCodeBlock'); typeText(ed, 'const'); await flushPromises();
  expect(load).toHaveBeenCalledTimes(1); expect(ed.view.dom.querySelector('.hljs-keyword')).not.toBeNull();
});
it('ignores a highlighter that resolves after destroy', /* destroy 후 resolve → 예외 없음 */);
it('Tab inserts indent inside code and Mod-Enter exits', /* '  ' 삽입, exit 후 p 생성 */);
it('slash menu is inactive inside code blocks', /* Task 15의 남은 케이스 */);
```

- [ ] **Step 2:** `npx vitest run tests/unit/extensions/code-block.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다. 하이라이트 플러그인은 별도 확장 `codeHighlight`로 등록한다. 그래야 `disable`로 끌 수 있다.
- [ ] **Step 4:** `npx vitest run tests/unit`을 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(blocks): add code block with lazy syntax highlighting`

---

### Task 17: 찾기와 바꾸기

**Files:**
- Create: `src/extensions/tools/findReplace.ts`, `src/ui/panels/findPanel.ts`
- Modify: `src/extensions/index.ts`, `src/i18n/{ko,en}.ts`
- Test: `tests/unit/extensions/find-replace.test.ts`, `tests/e2e/find.spec.ts`

**Interfaces:**
- Produces:
  - `findMatches(doc: PMNode, query: string, caseSensitive: boolean): Array<{ from: number; to: number }>`
    - 텍스트블록 단위로 텍스트를 이어 붙여 검색한다. 블록 경계를 넘는 일치는 찾지 않는다.
    - 위치를 문서 좌표로 매핑해서 반환한다.
  - 플러그인 상태 `{ query, caseSensitive, matches, current }`
    - 문서가 바뀌면 다시 계산한다.
    - 데코레이션 클래스: `le-find-match`, `le-find-current`
  - 명령
    - `openFind()`: 패널을 연다.
    - `setFindQuery(query: string, caseSensitive?: boolean)`
    - `findNext()`, `findPrev()`: 순환하고, 해당 위치로 선택과 스크롤을 옮긴다.
    - `replaceCurrent(text: string)`
    - `replaceAll(text: string)`: 트랜잭션 1개로 처리해서 실행취소 한 번에 되돌아가게 한다.
    - `closeFind()`
  - 단축키 `Mod-f` → `openFind`. 에디터에 포커스가 있을 때만 브라우저 찾기를 대체한다.
  - UI 항목 `findReplace`: panel 종류
  - `findPanel`
    - 구성: 찾기 입력, 바꾸기 입력, 대소문자 토글, 이전/다음, 바꾸기, 모두 바꾸기, `status.matchCount`(`{current}/{total}`)
    - `Enter`는 다음, `Shift+Enter`는 이전이다.
  - 언어팩 키: `toolbar.findReplace`, `panel.find.{find,replace,caseSensitive,prev,next,replaceOne,replaceAll}`, `status.matchCount`, `status.noMatch`

- [ ] **Step 1: 실패하는 테스트**

```ts
it('finds within blocks only, case-insensitive by default', () => {
  const ed = makeEditor({ content: '<p>Ab ab</p><p>a</p><p>b</p>' });
  expect(findMatches(ed.state.doc, 'ab', false)).toHaveLength(2); expect(findMatches(ed.state.doc, 'ab', true)).toHaveLength(1);
});
it('replaceAll is one undo step', () => { const ed = makeEditor({ content: '<p>a a a</p>' }); ed.exec('setFindQuery', 'a'); ed.exec('replaceAll', 'b');
  expect(ed.getHTML()).toBe('<p>b b b</p>'); ed.exec('undo'); expect(ed.getHTML()).toBe('<p>a a a</p>'); });
it('findNext cycles and selects the match', /* 3번째 다음은 1번째 */);
it('handles Korean and regex-like characters literally', /* '한.' 검색이 '한글'과 불일치 */);
```

  - E2E(`find.spec.ts`): `Mod-f`, 입력, 모두 바꾸기를 거치면 결과 HTML이 바뀐다.

- [ ] **Step 2:** `npx vitest run tests/unit/extensions/find-replace.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npx vitest run tests/unit && npx playwright test tests/e2e/find.spec.ts`를 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(tools): add find and replace`

---

### Task 18: 글자 수, 전체화면, 소스 보기

**Files:**
- Create: `src/extensions/tools/{wordCount.ts,fullscreen.ts,sourceView.ts}`, `src/ui/StatusBar.ts`
- Modify: `src/extensions/index.ts`, `src/core/defaults.ts`, `src/themes/editor.css`, `src/i18n/{ko,en}.ts`
- Test: `tests/unit/extensions/{word-count,fullscreen,source-view}.test.ts`

**Interfaces:**
- Produces:
  - `countText(text: string, locale: string): { chars: number; charsNoSpace: number; words: number }`
    - `Intl.Segmenter(locale, { granularity: 'grapheme' })`로 글자를 센다.
    - 단어는 `granularity: 'word'`에서 `isWordLike`인 것만 센다.
  - `wordCount` 확장
    - `components`로 `StatusBar`를 `status` 슬롯에 넣는다.
    - `StatusBar`는 `update`를 `DEFAULTS.status.debounce`(200)로 디바운스해서 다시 센다.
    - 표시 문구: `status.count`(`글자 {chars} · 공백 제외 {charsNoSpace} · 단어 {words}`)
  - `fullscreen` 확장
    - 명령 `toggleFullscreen()`: `root`에 `le-fullscreen` 클래스, `<html>`에 `le-scroll-locked` 클래스를 토글한다.
    - 전체화면일 때 `Escape` 단축키로 나간다.
    - UI 항목의 `isActive`는 클래스 존재 여부다.
  - `sourceView` 확장
    - 명령 `toggleSourceView()`
      - 켤 때: `.le-content`를 숨기고 `textarea.le-source`(값은 `formatHTML(getHTML())`)를 보여준다.
      - 끌 때: `setHTML(textarea.value)`를 호출한다. 정제는 이 과정에 포함된다.
      - 소스 모드 동안 `sourceView`를 뺀 모든 툴바 항목을 비활성화한다. 이를 위해 `EditorUI`에 `isLocked(): boolean`을 추가하고 `syncControl`이 참조한다.
    - destroy할 때 소스 모드면 먼저 적용한다.
  - 언어팩 키: `toolbar.{fullscreen,sourceView}`, `status.count`

- [ ] **Step 1: 실패하는 테스트**

```ts
it.each([['한글 abc', { chars: 6, charsNoSpace: 5, words: 2 }], ['👍🏽a', { chars: 2, charsNoSpace: 2, words: 1 }], ['', { chars: 0, charsNoSpace: 0, words: 0 }]])
  ('countText(%s)', (s, out) => expect(countText(s, 'ko')).toEqual(out));
it('status bar shows counts after debounce', /* typeText '한글' → 200ms → 텍스트에 '2' 포함 */);
it('fullscreen toggles classes and exits on Escape', /* root.le-fullscreen, html.le-scroll-locked, Escape 후 제거 */);
it('source view round-trips through the sanitizer', () => {
  const ed = makeEditor({ content: '<p>a</p>' }); ed.exec('toggleSourceView');
  const ta = ed.root.querySelector<HTMLTextAreaElement>('.le-source')!; ta.value = '<p>b<script>x</script></p>'; ed.exec('toggleSourceView');
  expect(ed.getHTML()).toBe('<p>bx</p>');
});
it('locks toolbar items except sourceView while active', /* bold 버튼 disabled */);
```

- [ ] **Step 2:** `npx vitest run tests/unit/extensions`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npx vitest run tests/unit`을 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(tools): add word count, fullscreen and source view`

---

### Task 19: 자동 임시저장

**Files:**
- Create: `src/io/autosave.ts`, `src/extensions/tools/autosave.ts`, `src/ui/RestoreBar.ts`
- Modify: `src/core/Editor.ts` (`clearDraft()`는 `exec('clearDraft')`에 위임), `src/extensions/index.ts`, `src/core/defaults.ts`, `src/i18n/{ko,en}.ts`
- Test: `tests/unit/io/autosave.test.ts`

**Interfaces:**
- Produces:
  - `class DraftStore`
    - `constructor(key: string, storage?: Storage | null)`
    - `readonly available: boolean`: 생성할 때 `setItem`/`removeItem`을 시험해서 판단한다.
    - `load(): { html: string; savedAt: number } | null`: JSON 파싱에 실패하면 `null`
    - `save(html: string): void`
    - `clear(): void`
  - 저장 키는 `DEFAULTS.autosave.prefix`(`'le-draft:'`)에 `key`를 붙인 것이다.
  - `autosave` 확장
    - `options.key`가 없으면 아무것도 하지 않는다.
    - `update` 중 `docChanged`인 것만 `debounce(options.debounce ?? DEFAULTS.autosave.debounce /* 1000 */)` 후 저장한다.
    - 저장소를 쓸 수 없으면 `STORAGE_UNAVAILABLE`을 report하고 끈다.
    - 명령 `clearDraft()`
    - `components`
      - `RestoreBar`를 `top` 슬롯에 넣는다. 생성 시 임시본이 있고 현재 HTML과 다를 때만 보인다.
      - 버튼은 `autosave.restore`(불러오기)와 `autosave.discard`(버리기)다.
      - 문구는 `autosave.found`(작성하던 내용이 있습니다. 불러올까요?)다.

- [ ] **Step 1: 실패하는 테스트**

```ts
it('saves after debounce and restores via the bar', () => {
  vi.useFakeTimers(); const a = makeEditor({ autosave: { key: 'k' } }); typeText(a, 'x'); vi.advanceTimersByTime(1000); a.destroy();
  const b = makeEditor({ autosave: { key: 'k' } }); b.root.querySelector<HTMLButtonElement>('[data-action="restore"]')!.click();
  expect(b.getHTML()).toBe('<p>x</p>');
});
it('discard and clearDraft remove the draft', /* localStorage 키 없음 */);
it('keeps drafts of different keys separate across editors', /* 'k1','k2' 독립 */);
it('reports STORAGE_UNAVAILABLE and stays usable when storage throws', /* setItem throw 스텁 */);
it('does nothing without a key', /* localStorage 비어 있음 */);
```

- [ ] **Step 2:** `npx vitest run tests/unit/io/autosave.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npx vitest run tests/unit`을 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(io): add autosave drafts with restore bar`

---

### Task 20: 버블 메뉴

**Files:**
- Create: `src/ui/BubbleMenu.ts`
- Modify: `src/ui/EditorUI.ts` (데스크톱에서만 마운트)
- Test: `tests/unit/ui/bubble-menu.test.ts`

**Interfaces:**
- Produces:
  - `class BubbleMenu extends UIComponent`
    - 보이는 조건: 데스크톱, 비어 있지 않은 `TextSelection`, 상황이 `text`나 `link`, 포인터 버튼이 눌려 있지 않음
    - 항목은 `BUBBLE_ITEMS` 중 등록된 것만이고, 컨트롤은 `controls.ts`로 만든다.
    - 위치는 `coordsAtPos(from)`와 `coordsAtPos(to)`로 만든 가상 요소를 기준으로 floating-ui `top`, `flip`, `shift`를 쓴다.
    - 포커스가 에디터와 메뉴 밖으로 나가면 숨긴다.

- [ ] **Step 1: 실패하는 테스트**

```ts
it('shows for a non-empty text selection and hides when collapsed', /* selectText → visible; 커서만 → hidden */);
it('hides inside code blocks and for node selections', /* codeBlock, image */);
it('hides while the pointer is down and shows on pointerup', /* pointerdown/up 디스패치 */);
it('applies bold from the bubble', /* 버블의 bold 클릭 → strong */);
```

- [ ] **Step 2:** `npx vitest run tests/unit/ui/bubble-menu.test.ts`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npx vitest run tests/unit`을 실행한다. Expected: PASS
- [ ] **Step 5: 커밋하고 M3 push**
  - 커밋 `feat(ui): add bubble menu`
  - 그다음 `git push -u origin claude/lay-editor-v1`

---

# M4 모바일과 배포

### Task 21: 모바일 모드

**Files:**
- Create: `src/ui/BottomSheet.ts`, `src/ui/MobileToolbar.ts`
- Modify: `src/ui/{EditorUI.ts,PanelHost.ts}`, `src/extensions/table/tablePanel.ts`, `src/core/defaults.ts`, `src/themes/{tokens.css,editor.css}`, `src/i18n/{ko,en}.ts`
- Test: `tests/unit/ui/{mobile-toolbar,bottom-sheet}.test.ts`, `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Produces:
  - `EditorUI`
    - `device.onChange`를 받으면 `root.dataset.mode`를 갱신하고 `modeChange`를 emit한다.
    - `viewport: ViewportTracker`를 소유한다.
    - 모드별 컴포넌트를 교체한다.
      - 데스크톱: `Toolbar`, `ContextToolbar`, `BubbleMenu`
      - 모바일: `MobileToolbar`
  - `class MobileToolbar extends UIComponent`
    - `document.body`의 `.le-portal.le-mobile-bar`에 한 줄로 고정한다. 가로 스크롤이고 `scroll-snap`을 쓴다.
    - 항목: `contextOnlyItems(ui.registry, ctx)` 다음에 `toolbarItems().filter(i => i.contexts.includes(ctx))`
    - 에디터에 포커스가 있을 때만 보인다. 컨트롤의 `pointerdown`을 막아서 키보드가 닫히지 않게 한다.
    - 위치는 `style.bottom = ViewportTracker.bottomInset + 'px'`이다.
    - 막대 높이를 `--le-mobile-bar-height`로 루트에 알리고, 콘텐츠의 `scroll-padding-bottom`에 반영한다.
  - `class BottomSheet implements PanelContainer`
    - 포털 안에 배경과 시트를 둔다. `role="dialog"`, `aria-modal="true"`
    - 닫는 방법: `Esc`, 배경 탭, 손잡이를 아래로 끌기(`DEFAULTS.sheet.dismissDistance` 80px)
    - 높이는 최대 `--le-sheet-max-height`(70vh)이다. 열릴 때 `trapFocus`를 건다.
  - `PanelHost`: 모바일이면 `BottomSheet`, 아니면 `Dropdown`
  - `tablePanel`: 모바일이면 `DEFAULTS.table.mobileMaxGrid`를 쓴다.
  - CSS: `[data-mode=mobile] .le-resize-handle { display: none }`. 모바일 컨트롤 높이와 폭은 `--le-touch-target` 이상이다.

- [ ] **Step 1: 실패하는 테스트.** `pointer: coarse`, 컨테이너 폭 400, `visualViewport` 높이 감소를 스텁한다.

```ts
it('switches to mobile: mobile bar in a portal, no desktop toolbar', /* .le-mobile-bar 존재, .le-editor .le-toolbar 없음, root[data-mode=mobile] */);
it('positions above the keyboard using visualViewport', () => { setViewport({ height: 500, offsetTop: 0 }, 800); /* bar.style.bottom === '300px' */ });
it('swaps to table items inside a table, keeping text items that allow table', /* tableAddRowAfter 먼저, bold도 포함 */);
it('opens panels as a bottom sheet and closes on backdrop tap', /* textColor 클릭 → .le-sheet */);
it('shows only while the editor is focused', /* focus → visible, blur → hidden */);
```

  - E2E(`mobile.spec.ts`, `mobile-chromium`)
    - 탭하면 하단 막대가 보이고, 그 막대가 화면 아래쪽 25% 안에 있다.
    - 색상 버튼을 누르면 바텀시트가 열린다.
    - 이미지를 선택하면 막대에 너비 버튼이 나타난다.

- [ ] **Step 2:** `npx vitest run tests/unit/ui`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npx vitest run tests/unit && npx playwright test --project=mobile-chromium`를 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(ui): add mobile keyboard toolbar and bottom sheets`

---

### Task 22: React와 Vue 래퍼

**Files:**
- Create: `src/adapters/{shared.ts,react.ts,vue.ts}`
- Modify: `vite.config.ts` (entry에 `react`, `vue` 추가), `package.json` (`peerDependencies`, `peerDependenciesMeta` optional)
- Test: `tests/unit/adapters/{react,vue}.test.ts`

**Interfaces:**
- Produces:
  - `createSyncedEditor(el: HTMLElement, options: Omit<EditorOptions,'element'|'content'|'onChange'>, initial: string | null | undefined, emit: (html: string) => void): { editor: Editor; applyValue(v: string | null | undefined): void; destroy(): void }`
    - `null`과 `undefined`는 `''`로 처리한다.
    - `applyValue`는 마지막으로 내보낸 HTML과 다를 때만 `setHTML`을 호출한다.
  - React
    - `LayEditor = forwardRef<Editor | null, LayEditorProps>`
    - `LayEditorProps = Omit<EditorOptions,'element'|'content'|'onChange'> & { value?: string | null; defaultValue?: string; onChange?(html: string): void; className?: string }`
    - 옵션은 마운트할 때 1회만 읽는다. `value`, `theme`, `locale`은 effect로 반영한다.
    - 언마운트하면 destroy한다.
  - Vue
    - `LayEditor = defineComponent`
    - props: `modelValue`, `options`, `theme`, `locale`
    - emits: `update:modelValue`, `ready`
    - `expose({ editor })`
    - render 함수로 작성한다. SFC를 쓰지 않는다.

- [ ] **Step 1: 실패하는 테스트**

```ts
// react.test.ts (react-dom/client + act)
it('mounts, emits onChange, applies value changes without echo, destroys on unmount', async () => {
  const onChange = vi.fn(); const ref = createRef<Editor | null>(); /* render <LayEditor ref value="<p>a</p>" onChange /> */
  /* ref.current!.exec('toggleBold') 등 편집 → onChange 호출; rerender value=<p>b</p> → getHTML '<p>b</p>'; 같은 값 rerender → setHTML 미호출(spy) */
  /* unmount → document.querySelector('.le-editor') null */
});
it('treats value null/undefined as empty', /* value={null} → getHTML '' */);
// vue.test.ts (createApp + mount)
it('supports v-model and exposes the editor', /* modelValue 변경 반영, update:modelValue emit */);
```

- [ ] **Step 2:** `npx vitest run tests/unit/adapters`를 실행한다. Expected: FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npx vitest run tests/unit && npx tsc --noEmit`를 실행한다. Expected: PASS
- [ ] **Step 5: 커밋** `feat(adapters): add React and Vue wrappers`

---

### Task 23: 배포 빌드

**Files:**
- Create: `vite.umd.config.ts`, `scripts/build-css.mjs`, `scripts/check-size.mjs`, `scripts/verify-exports.mjs`
- Modify: `package.json` (`exports`, `files`, `unpkg`, `jsdelivr`, `build` 스크립트 완성, `laymaker.sizeBudget: 153600`)

**Interfaces:**
- Produces:
  - `exports`

```json
{ ".": { "types": "./dist/types/index.d.ts", "import": "./dist/index.js" },
  "./react": { "types": "./dist/types/adapters/react.d.ts", "import": "./dist/react.js" },
  "./vue": { "types": "./dist/types/adapters/vue.d.ts", "import": "./dist/vue.js" },
  "./style.css": "./dist/style.css", "./content.css": "./dist/content.css" }
```

  - `unpkg`과 `jsdelivr` 필드는 `./dist/editor.umd.js`를 가리킨다.
  - `vite.umd.config.ts`
    - `entry src/index.ts`, `formats ['umd']`, `name 'LayEditor'`, `fileName () => 'editor.umd.js'`
    - `inlineDynamicImports: true`: UMD는 코드 분할이 안 돼서 lowlight가 같이 들어간다. 문서에 이 점을 명시한다.
    - `emptyOutDir: false`
  - `build-css.mjs`
    - `CSS_BUNDLES = { 'style.css': ['src/themes/tokens.css','src/themes/editor.css','src/themes/content.css'], 'content.css': ['src/themes/tokens.css','src/themes/content.css'] }`
    - 목록대로 이어 붙여 `dist/`에 쓴다.
  - `check-size.mjs`
    - `dist/index.js`와 그 파일이 정적으로 import하는 청크의 gzip 합을 계산한다. lowlight 동적 청크는 제외한다.
    - 합계가 `package.json`의 `laymaker.sizeBudget`을 넘으면 exit 1이다.
  - `verify-exports.mjs`
    - `exports`의 모든 경로가 실제로 있는지 확인한다.
    - `node`로 `dist/index.js`를 동적 import할 수 있는지 확인한다. DOM 접근이 import 시점에 일어나지 않아야 한다.

- [ ] **Step 1:** 실패 확인. `npm run build`를 실행한다. Expected: 스크립트 파일이 없어서 FAIL
- [ ] **Step 2:** 구현한다.
- [ ] **Step 3: 빌드 검증**
  - Run: `npm run build`
  - Expected
    - `dist/{index.js,react.js,vue.js,editor.umd.js,style.css,content.css,types/index.d.ts}`가 생성된다.
    - `check-size`가 `core gzip: <N> / 153600`을 출력하고 통과한다.
- [ ] **Step 4: UMD 스모크 테스트**
  - `tests/e2e/umd.spec.ts`를 작성한다. 내용: `dist/editor.umd.js`와 `dist/style.css`만 쓰는 정적 페이지(`demo/umd.html`)에서 `LayEditor.createEditor` 호출이 동작한다.
  - Run: `npx playwright test tests/e2e/umd.spec.ts`
  - Expected: PASS
- [ ] **Step 5: 커밋** `build: add UMD bundle, CSS bundles, size budget and export checks`

---

### Task 24: 문서와 최종 검증

**Files:**
- Create: `docs/usage.md`, `docs/device-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 공개 API 전체

- [ ] **Step 1: `docs/usage.md` 작성**
  - 설치: npm과 `<script>` 두 방식
  - textarea 모드
  - 옵션 표: 스펙 5.1에서 `video.providers` 변경을 반영한 것
  - 업로드 예제: `fetch`와 `FormData`
  - 이벤트
  - 보기 페이지
    - `content.css`를 불러오고 `.le-prose`로 감싼다.
    - 서버에서도 정제해야 한다는 경고
  - 사용자 확장 예제(@멘션 골격)
  - 테마 변수 표, 언어팩 추가 방법
  - React/Vue 예제
  - UMD 용량 안내(lowlight 포함)
- [ ] **Step 2: `docs/device-checklist.md` 작성**
  - 기기: iOS Safari, Android Chrome, 삼성 인터넷
  - 기기별 확인 항목
    - 키보드 위 툴바
    - 한글 조합(제목, 목록, 표 안)
    - 이미지 너비 버튼
    - 바텀시트
    - 표 편집
    - 회전
    - 다크 모드
- [ ] **Step 3: `README.md` 작성**: 소개, 빠른 시작 10줄, 문서 링크
- [ ] **Step 4: 전체 검증**
  - Run: `npm run lint && npm run typecheck && npm test && npm run build && npx playwright test`
  - Expected: 전부 통과. 마지막 출력에 실패 0이 보여야 한다.
- [ ] **Step 5: 커밋하고 M4 push**
  - 커밋 `docs: add usage guide and device checklist`
  - 그다음 `git push -u origin claude/lay-editor-v1`
