# @laymaker/editor Android 래퍼 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 에디터를 WebView로 감싼 Android 라이브러리(`com.laymaker:editor-android`, `com.laymaker:editor-compose`)와 시험용 앱을 만들고, Maven Central 게시 준비까지 마친다.

**Architecture:**
- 웹 쪽은 `src/hosts/android/`의 호스트 스크립트 하나만 새로 만든다. 이 스크립트가 기존 `createEditor`로 에디터를 만들고 `LayBridge` 메시지 채널로 Kotlin과 통신한다.
- Kotlin 쪽은 순수 Kotlin 클래스(코덱, 채널, 업로드 수신, 상태 저장)와 이것들을 묶는 `LayEditorView`로 나눈다. 순수 클래스는 JVM 테스트로, 뷰 연결은 Robolectric으로 검증한다.
- 메시지 이름, 조각 크기, 자산 경로는 `protocol.json` 하나에서 TS와 Kotlin이 같이 읽는다.

**Tech Stack:**
- 웹: 기존 스택(TypeScript 6.0.3, Vite 8, Vitest, Playwright)
- Android: Kotlin, AGP 9.x, Gradle 래퍼, androidx.webkit, androidx.activity, kotlinx-coroutines, Android 내장 `org.json`(JVM 테스트에는 `org.json:json`을 testImplementation으로), Jetpack Compose(BOM), JUnit 4, Robolectric, `com.vanniktech.maven.publish`

**Spec:** `docs/superpowers/specs/2026-11-07-android-design.md` (이하 "스펙")

## Global Constraints

- 브랜치 `claude/lay-editor-v1`에 커밋한다. 커밋 메시지는 영어 conventional 형식이고 끝에 아래 두 줄을 붙인다.
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017vEfkuNca5ELGK7XqWiEbj
  ```
- 조직 규칙: 클래스·함수 단위, DRY, 중복 코드와 하드코딩 금지.
  - 웹 수치는 `DEFAULTS`, Android 수치는 `LayDefaults`, 양쪽 공용 값은 `src/hosts/android/protocol.json`에만 둔다.
  - 사용자에게 보이는 문구는 웹 언어팩(ko/en)에만 둔다. Kotlin에는 사용자 문구가 없다.
- 좌표: `com.laymaker:editor-android`, `com.laymaker:editor-compose`. 버전은 `package.json`의 `version`에서 읽는다.
- 패키지: `com.laymaker.editor`, `com.laymaker.editor.compose`. 시험용 앱은 `com.laymaker.editor.sample`.
- minSdk 24. compileSdk·targetSdk는 android-37. 버전 숫자는 모두 `android/gradle/libs.versions.toml`에만 둔다.
- 라이브러리(`editor`)의 런타임 의존성은 `androidx.webkit`, `androidx.activity`, `kotlinx-coroutines-android`만 쓴다(스펙 2.2). JSON은 Android 내장 `org.json`으로 처리한다. Compose 의존성은 `editor-compose`에만 둔다.
- 메시지 허용 출처는 `https://appassets.androidplatform.net` 하나다.
- 웹 → Kotlin 통신은 `WebViewCompat.addWebMessageListener`, Kotlin → 웹은 받은 `JavaScriptReplyProxy.postMessage`만 쓴다. `evaluateJavascript`와 `addJavascriptInterface`는 쓰지 않는다.
- 외부로 여는 링크 스킴은 `http:`, `https:`, `mailto:`, `tel:`만 허용한다.
- Android SDK는 저장소 밖(`/opt/android-sdk`)에 설치하고 `android/local.properties`(gitignore)로 가리킨다.
- 이 환경에는 에뮬레이터가 없다. 계측 테스트(androidTest)는 만들지 않는다.

## Review Focus

1. **아주 긴 문서(수 MB)**: `change`로 받은 HTML을 상태로 저장할 때 Bundle 1MB 제한에 걸려 앱이 죽지 않아야 한다. Task 10의 `stores a 2MB document in a file` 테스트가 고정한다.
2. **용량 한도 근처 이미지(10MB)**: 조각 20개로 나뉘어 오가고, 다시 합친 바이트가 원본과 같아야 한다. Task 3과 Task 9의 `10MB` 테스트가 고정한다.
3. **해제 중이거나 해제된 뒤의 호출**: 대기 중인 `suspend` 호출은 `CancellationException`으로 끝나고, 해제 뒤 호출은 오류 없이 무시되어야 한다. Task 8의 `close cancels pending calls` 테스트가 고정한다.
4. **깨졌거나 모르는 메시지**: 형식이 틀린 JSON이나 모르는 `type`이 와도 무시하고, 앱이 죽지 않아야 한다. Task 6과 Task 8의 `ignores malformed` 테스트가 고정한다.
5. **한 화면에 에디터 두 개**: 파일 선택 등록 키, 상태 저장 키, 메시지가 서로 섞이지 않아야 한다. Task 11의 `two editors keep separate state keys` 테스트가 고정한다.

---

## 파일 구조

```
src/hosts/android/
  protocol.json        공용 값: version, objectName, assetHost, assetPath, entry, chunkSize, methods, events, hostMessages, nativeMessages, linkSchemes
  protocol.ts          메시지 타입(유니온)과 protocol.json 재내보내기, 메시지 판별 함수
  upload.ts            BridgeUploads: 파일 → base64 조각 전송, 진행률·결과 대기
  links.ts             routeLinks: window.open → openLink 메시지
  host.ts              AndroidHost: hello/init/ready/call/event 처리
  main.ts              자동 시작(진입점)
  host.html            빈 페이지(style.css, host.js)
vite.android.config.ts IIFE 빌드 → dist/android/host.js
tests/fixtures/android-protocol.json   양방향 메시지 예제(양쪽 테스트 공용)
tests/unit/android-host.test.ts        Vitest
tests/e2e/android-host.spec.ts         Playwright(가짜 LayBridge)

android/
  settings.gradle.kts, build.gradle.kts, gradle.properties, gradle/libs.versions.toml, gradlew*
  build-logic/ (convention 없이 루트 build.gradle.kts의 공용 함수로 충분하면 만들지 않는다)
  editor/
    build.gradle.kts                  generateProtocol, syncWebAssets 작업, 게시 설정
    src/main/kotlin/com/laymaker/editor/
      LayEditorView.kt                공개 뷰
      LayEditorOptions.kt             옵션, LayTheme, 옵션 → JSON
      LayEvent.kt                     공개 이벤트 + EventDecoder
      LayUploader.kt                  LayUploader, LayUploadFile, LayUploadResult
      LayEditorException.kt
      LayDefaults.kt                  Android 쪽 수치
      internal/Messages.kt            HostMessage, NativeMessage, MessageCodec
      internal/EditorChannel.kt       대기열, 호출 결과, 이벤트 흐름
      internal/UploadReceiver.kt      조각 합치기, 업로더 호출, 임시 파일 정리
      internal/HtmlStateStore.kt      상태 저장(인라인 또는 파일)
      internal/ExternalLinks.kt       허용 스킴만 외부 앱으로
      internal/FileChooser.kt         onShowFileChooser 처리
      internal/WebViewFactory.kt      설정, 자산 로더, 클라이언트 구성
    build/generated/.../Protocol.kt   protocol.json에서 생성
  editor-compose/
    src/main/kotlin/com/laymaker/editor/compose/LayEditor.kt   LayEditorState, rememberLayEditorState, LayEditor
  sample/
    src/main/kotlin/com/laymaker/editor/sample/  MainActivity, ViewScreen, ComposeScreen, DemoUploader
```

---

### Task 1: 공용 프로토콜 파일과 TS 타입

**Files:**
- Create: `src/hosts/android/protocol.json`, `src/hosts/android/protocol.ts`, `tests/fixtures/android-protocol.json`
- Test: `tests/unit/android-host.test.ts`

**Interfaces:**
- Produces:
  - `protocol.json` 키: `version: 1`, `objectName: "LayBridge"`, `assetHost: "appassets.androidplatform.net"`, `assetPath: "/laymaker/"`, `entry: "host.html"`, `chunkSize: 524288`, `methods: ["getHTML","setHTML","getText","isEmpty","exec","can","isActive","focus","blur","setEditable","setTheme","setLocale","clearDraft"]`, `events: ["change","focus","blur","selectionChange","uploadStart","uploadProgress","uploadSuccess","uploadError","modeChange","error"]`, `hostMessages: ["hello","ready","event","result","uploadBegin","uploadChunk","openLink","fatal"]`, `nativeMessages: ["init","call","uploadProgress","uploadDone"]`, `linkSchemes: ["http:","https:","mailto:","tel:"]`
  - `protocol.ts`: `export const PROTOCOL` (JSON 그대로), `export type HostMessage` / `NativeMessage` (스펙 4절 표의 필드를 가진 `type` 판별 유니온), `export function parseNativeMessage(raw: string): NativeMessage | null`
  - 픽스처: `{ "host": HostMessage[], "native": NativeMessage[], "invalid": string[] }`. 메시지 종류마다 예제 1개 이상, `invalid`에는 깨진 JSON, 모르는 type, 필드 누락 예제.

- [ ] **Step 1: 실패하는 테스트 작성** (`describe('android protocol')`)
  - `every hostMessages/nativeMessages name has a fixture`: 픽스처의 `type` 집합이 `PROTOCOL.hostMessages`, `PROTOCOL.nativeMessages`와 같다.
  - `parses every native fixture`: `parseNativeMessage(JSON.stringify(m))`가 `m`과 같다.
  - `rejects invalid input`: `invalid`의 모든 항목에 `null`.
- [ ] **Step 2: 실행해서 실패 확인** — `npx vitest run tests/unit/android-host.test.ts` → 모듈 없음으로 FAIL
- [ ] **Step 3: 파일 작성.** `parseNativeMessage`는 `JSON.parse` 예외와 `nativeMessages`에 없는 type, 필수 필드 누락을 `null`로 돌려준다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: 커밋** — `feat(android): add the shared bridge protocol`

### Task 2: 업로드 조각 전송 (`BridgeUploads`)

**Files:**
- Create: `src/hosts/android/upload.ts`
- Test: `tests/unit/android-host.test.ts`

**Interfaces:**
- Consumes: `PROTOCOL.chunkSize`, `HostMessage`, `NativeMessage` (Task 1)
- Produces: `export class BridgeUploads { constructor(send: (m: HostMessage) => void, chunkSize = PROTOCOL.chunkSize); readonly upload: UploadFn; receive(m: Extract<NativeMessage, { type: 'uploadProgress' | 'uploadDone' }>): void; rejectAll(reason: string): void }`

- [ ] **Step 1: 실패하는 테스트 작성** (`describe('BridgeUploads')`)
  - `splits a file into base64 chunks`: 1,200,000바이트 파일 → `uploadBegin`(`chunks: 3`, name, mime, size) 다음 `uploadChunk` 3개. 조각을 이어 디코딩하면 원본 바이트와 같다.
  - `10MB file is sent as 20 chunks`: 10×1024×1024바이트 → `chunks: 20`.
  - `resolves with the url from uploadDone`: `receive({type:'uploadDone', id, url:'https://x/a.png', alt:'a'})` → `upload()`가 `{url, alt}`로 끝난다.
  - `rejects when uploadDone carries an error`: `error: 'boom'` → `upload()`가 `Error('boom')`으로 거절된다.
  - `forwards progress`: `uploadProgress` `ratio: 0.5` → `ctx.onProgress(0.5)` 호출.
  - `rejectAll rejects pending uploads`.
- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/android-host.test.ts -t BridgeUploads` FAIL
- [ ] **Step 3: 구현.** id는 인스턴스 안에서 1부터 증가한다. 조각은 `file.slice(start, end).arrayBuffer()` → base64(브라우저 `btoa`, 8KB 단위로 문자열을 만들어 콜 스택 초과를 피함). 조각은 순서대로 하나씩 보낸다.
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat(android): send uploads to Kotlin in base64 chunks`

### Task 3: 호스트 (`AndroidHost`, `routeLinks`)

**Files:**
- Create: `src/hosts/android/host.ts`, `src/hosts/android/links.ts`
- Test: `tests/unit/android-host.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2, 기존 `createEditor`, `Editor`, `EditorError`
- Produces:
  - `export interface BridgeLike { postMessage(data: string): void; onmessage: ((e: { data: string }) => void) | null }`
  - `export class AndroidHost { constructor(bridge: BridgeLike, mount: HTMLElement, create = createEditor); start(): void; destroy(): void }`
  - `export function routeLinks(win: Window, send: (m: HostMessage) => void): () => void` (원래 `window.open` 복원 함수 반환)

- [ ] **Step 1: 실패하는 테스트 작성** (`describe('AndroidHost')`, jsdom, 가짜 브리지가 보낸 메시지를 배열에 모은다)
  - `says hello with the protocol version`: `start()` 직후 첫 메시지가 `{type:'hello', version: 1}`.
  - `creates the editor on init and reports ready`: `init` `{content:'<p>a</p>'}` → `ready`, 이어서 `call getHTML`의 `result.value`가 `'<p>a</p>'`.
  - `passes an upload function only when init says so`: `init.options.upload === true`일 때만 `createEditor`가 `upload` 함수를 받는다(`create` 주입으로 확인).
  - `forwards editor events`: 입력 후 `event` `name:'change'`, `args[0]`이 HTML. `update`는 보내지 않는다.
  - `rejects methods outside the allow-list`: `call` `method:'destroy'` → `result` `ok:false`.
  - `reports fatal when createEditor throws`: `create`가 `EditorError('INVALID_OPTION')`를 던지면 `fatal` `code:'INVALID_OPTION'`.
  - `ignores malformed messages`: `onmessage({data:'{'})` → 예외 없음, 보낸 메시지 없음.
  - `routeLinks posts openLink for allowed schemes only`: `window.open('https://a.b')` → `openLink`, `window.open('javascript:alert(1)')` → 아무것도 보내지 않고 `null` 반환.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현.**
  - `call` 처리는 `PROTOCOL.methods`에 있는 이름만 `editor[method](...args)`로 실행한다. 결과가 `undefined`면 `value: null`.
  - 이벤트 전달은 `PROTOCOL.events` 목록을 돌며 `editor.on(name, ...)`으로 등록한다(이름을 코드에 다시 쓰지 않는다). `File` 인자는 `{name, size, type}`으로, `EditorError`는 `{code, message}`로 바꾼다.
  - `init.options.upload`는 boolean이다. true면 `BridgeUploads.upload`를 넣는다.
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat(android): add the WebView host that drives the editor over the bridge`

### Task 4: 호스트 빌드와 브라우저 테스트

**Files:**
- Create: `src/hosts/android/main.ts`, `src/hosts/android/host.html`, `vite.android.config.ts`, `tests/e2e/android-host.spec.ts`
- Modify: `package.json` (`build:android` 스크립트, `build` 끝에 `&& npm run build:android`, `files`에 `"!dist/android"`), `scripts/build-css.mjs` (`dist/android/style.css`도 쓰기), `eslint.config.js`(필요 시)

**Interfaces:**
- Consumes: Task 3
- Produces: `dist/android/host.html`, `dist/android/host.js`(IIFE, 에디터 포함), `dist/android/style.css`. Task 5의 Gradle 작업이 이 폴더를 그대로 복사한다.

- [ ] **Step 1: 실패하는 E2E 작성** (데스크톱·모바일 Chromium, `page.addInitScript`로 가짜 `window.LayBridge` 주입, 가짜 브리지가 `hello`를 받으면 `init`을 보낸다. 페이지는 개발 서버의 `/src/hosts/android/host.html`)
  - `boots, edits and returns HTML through the bridge`: 입력 → `change` 이벤트 수신, `call getHTML` 결과 일치.
  - `uploads an image through chunks`: 이미지 패널의 file input에 PNG 지정 → 가짜 브리지가 `uploadBegin`/`uploadChunk`를 받고 `uploadDone` `url:'https://example.com/a.png'`로 답하면 문서에 그 주소의 이미지가 들어간다.
  - `composes Korean`: 기존 `ime.spec.ts`의 CDP 조합 도우미로 "한글" 입력 → `change` HTML에 "한글".
  - `opens links through openLink`: 링크를 넣고 문맥 툴바의 "링크 열기" → `openLink` 수신, 페이지 이동 없음.
- [ ] **Step 2: 실패 확인** — `E2E_PORT=5173 npx playwright test tests/e2e/android-host.spec.ts --workers=2` FAIL
- [ ] **Step 3: 구현.** `main.ts`는 `window[PROTOCOL.objectName]`이 있으면 `new AndroidHost(bridge, document.getElementById('editor')!).start()`. `vite.android.config.ts`는 기존 UMD 설정처럼 `lib`을 쓰되 `formats: ['iife']`, 진입점 `src/hosts/android/main.ts`, 출력 `dist/android/host.js`, `host.html`은 `publicDir`이 아니라 빌드 후 복사(스크립트 경로를 상대 경로로).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm run build`가 `dist/android/` 세 파일을 만들고 기존 검사(내보내기, 용량)를 통과한다.
- [ ] **Step 5: 커밋** — `build(android): bundle the WebView host page`

### Task 5: Gradle 프로젝트, SDK, 프로토콜 생성, 자산 복사

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/gradle/libs.versions.toml`, `android/gradlew`, `android/gradlew.bat`, `android/gradle/wrapper/*`, `android/editor/build.gradle.kts`, `android/editor/src/main/AndroidManifest.xml`, `android/editor/src/test/kotlin/com/laymaker/editor/ProtocolTest.kt`, `android/editor/src/main/kotlin/com/laymaker/editor/LayDefaults.kt`
- Modify: `.gitignore` (`android/**/build`, `android/.gradle`, `android/local.properties`, `android/.kotlin`)

**Interfaces:**
- Produces:
  - 생성 코드 `internal object Protocol { const val VERSION: Int; const val OBJECT_NAME: String; const val ASSET_HOST: String; const val ASSET_PATH: String; const val ENTRY: String; const val CHUNK_SIZE: Int; val METHODS: Set<String>; val EVENTS: Set<String>; val LINK_SCHEMES: Set<String>; object Host { const val HELLO = "hello" ... }; object Native { const val INIT = "init" ... } }`
  - `object LayDefaults { const val STATE_INLINE_LIMIT = 256 * 1024 }` (이후 Task가 상수를 더한다)
  - 테스트 JVM에 시스템 속성 `laymaker.fixtures` = `tests/fixtures/android-protocol.json`의 절대 경로

- [ ] **Step 1: SDK 설치(저장소 밖).** `/opt/android-sdk`에 command-line tools를 받고 `sdkmanager --licenses`, `platforms;android-37`, 그에 맞는 `build-tools`를 설치한다. `android/local.properties`에 `sdk.dir=/opt/android-sdk`.
- [ ] **Step 2: 버전 확정.** maven.google.com과 Maven Central에서 실제로 받을 수 있는 최신 안정 버전을 확인해 `libs.versions.toml`에 고정한다(AGP 9.x, Kotlin, androidx.webkit, androidx.activity, coroutines, Compose BOM, Robolectric, JUnit, 테스트용 org.json, vanniktech). Gradle 래퍼는 그 AGP가 요구하는 버전으로 만든다.
- [ ] **Step 3: 실패하는 테스트 작성** (`ProtocolTest`)
  - `constants match protocol json`: `Protocol.CHUNK_SIZE == 524288`, `Protocol.OBJECT_NAME == "LayBridge"`, `Protocol.METHODS`에 `"getHTML"` 포함, `Protocol.Host.HELLO == "hello"`.
  - `version comes from package json`: `BuildConfig`가 아니라 생성된 `Protocol.LIBRARY_VERSION`이 `package.json`의 `version`과 같다(테스트가 `package.json`을 직접 읽어 비교).
- [ ] **Step 4: 실패 확인** — `cd android && ./gradlew :editor:testDebugUnitTest` FAIL(`Protocol` 없음)
- [ ] **Step 5: 구현.**
  - 루트 `build.gradle.kts`: `package.json`의 `version`을 읽어 모든 프로젝트의 `version`, `group = "com.laymaker"`로 둔다.
  - `editor/build.gradle.kts`:
    - `generateProtocol`: `../../src/hosts/android/protocol.json`과 `package.json`을 입력으로 `Protocol.kt`를 생성(Groovy `JsonSlurper`), 생성 폴더를 Kotlin 소스로 등록.
    - `buildWebAssets`(Exec): 저장소 루트에서 `npm run build:android`. 입력 `src/`, `package.json`, `vite.android.config.ts`; 출력 `dist/android`.
    - `syncWebAssets`(Sync): `dist/android` → `build/generated/laymaker-assets/laymaker/`, 이 폴더를 `assets` 소스로 등록, `preBuild`가 의존.
    - 단위 테스트 작업에 `systemProperty("laymaker.fixtures", ...)`.
- [ ] **Step 6: 통과 확인** — 같은 명령 PASS, `./gradlew :editor:assembleDebug` 성공, AAR 안에 `assets/laymaker/host.html` 존재(`unzip -l`로 확인)
- [ ] **Step 7: 커밋** — `build(android): add the Gradle project with generated protocol constants and bundled web assets`

### Task 6: 메시지 코덱 (`MessageCodec`)

**Files:**
- Create: `android/editor/src/main/kotlin/com/laymaker/editor/internal/Messages.kt`
- Test: `android/editor/src/test/kotlin/com/laymaker/editor/MessageCodecTest.kt`

**Interfaces:**
- Consumes: `Protocol` (Task 5)
- Produces:
  - `internal sealed interface HostMessage`: `Hello(version: Int)`, `Ready`, `Event(name: String, args: JSONArray)`, `Result(id: Long, ok: Boolean, value: Any?, error: String?)`, `UploadBegin(id: Long, name: String, mime: String, size: Long, chunks: Int)`, `UploadChunk(id: Long, index: Int, data: String)`, `OpenLink(href: String)`, `Fatal(code: String, message: String)`
  - `internal sealed interface NativeMessage`: `Init(options: JSONObject)`, `Call(id: Long, method: String, args: JSONArray)`, `UploadProgress(id: Long, ratio: Double)`, `UploadDone(id: Long, url: String? = null, alt: String? = null, error: String? = null)`
  - `internal object MessageCodec { fun decode(raw: String): HostMessage?; fun encode(message: NativeMessage): String }` (`type` 판별자, 값은 `Protocol.Host`/`Protocol.Native` 상수)

- [ ] **Step 1: 실패하는 테스트 작성** (픽스처 파일 공용)
  - `decodes every host fixture`: 각 `host` 예제가 `null`이 아닌 해당 클래스로 디코딩된다.
  - `encodes native messages exactly like the fixtures`: 각 `native` 예제를 Kotlin 객체로 만들어 `encode` → JSON 동등 비교.
  - `ignores malformed and unknown input`: `invalid` 모든 항목 → `null`, 예외 없음.
- [ ] **Step 2: 실패 확인** — `./gradlew :editor:testDebugUnitTest --tests '*MessageCodecTest'` FAIL
- [ ] **Step 3: 구현** — `org.json`으로 `type`을 먼저 읽고 `Protocol.Host`/`Protocol.Native` 상수로 분기한다. 필수 필드가 없거나 타입이 틀리면 `null`(`JSONException`을 밖으로 내보내지 않는다).
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat(android): add the bridge message codec`

### Task 7: 옵션, 테마, 이벤트 (`LayEditorOptions`, `LayEvent`)

**Files:**
- Create: `LayEditorOptions.kt`, `LayEvent.kt`, `LayEditorException.kt` (모두 `android/editor/src/main/kotlin/com/laymaker/editor/`)
- Test: `android/editor/src/test/kotlin/com/laymaker/editor/OptionsAndEventsTest.kt`

**Interfaces:**
- Consumes: Task 6
- Produces:
  - `enum class LayTheme { LIGHT, DARK, AUTO }`, `internal fun LayTheme.resolve(isNight: Boolean): String` (`"light"`/`"dark"`)
  - `data class LayEditorOptions(val content: String? = null, val preset: String? = null, val toolbar: List<String>? = null, val locale: String? = null, val theme: LayTheme = LayTheme.AUTO, val placeholder: String? = null, val changeDebounce: Int? = null, val disable: List<String> = emptyList(), val extra: Map<String, Any?> = emptyMap())`
  - `internal fun LayEditorOptions.toInit(isNight: Boolean, deviceLocale: Locale, hasUploader: Boolean, contentOverride: String?): JSONObject`
  - `sealed interface LayEvent`: `Ready`, `Change(html: String)`, `Focus`, `Blur`, `SelectionChange`, `UploadStart(name: String)`, `UploadProgress(name: String, ratio: Float)`, `UploadSuccess(name: String, url: String)`, `UploadError(name: String, code: String, message: String)`, `ModeChange(mode: String)`, `Error(code: String, message: String)`
  - `internal object EventDecoder { fun decode(name: String, args: JSONArray): LayEvent? }`
  - `class LayEditorException(val code: String, message: String) : RuntimeException(message)`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `auto theme follows night mode`: `AUTO.resolve(true) == "dark"`, `AUTO.resolve(false) == "light"`, `LIGHT.resolve(true) == "light"`.
  - `init json carries typed fields, extra and upload flag`: `extra = mapOf("image" to mapOf("maxSize" to 1000))` → JSON에 `"image":{"maxSize":1000}`, `upload` = `hasUploader`, null 필드는 빠진다.
  - `null locale uses the device locale tag`: `Locale.KOREA` → `"ko-KR"`.
  - `restored content overrides options content`: `contentOverride = "<p>r</p>"` → `content == "<p>r</p>"`.
  - `extra cannot override typed fields`: `extra = mapOf("theme" to "x")` → `theme`는 resolve 값 유지.
  - `decodes events from fixtures`: `change` → `Change(html)`, `uploadError` → `UploadError(name, code, message)`, 모르는 이름 → `null`.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — `extra` 값은 `Map`, `List`, `String`, `Number`, `Boolean`, `null`만 `JSONObject`/`JSONArray`/원시값으로 바꾸고 그 외 타입은 `IllegalArgumentException`.
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat(android): add editor options, theme resolution and events`

### Task 8: 채널 (`EditorChannel`)

**Files:**
- Create: `android/editor/src/main/kotlin/com/laymaker/editor/internal/EditorChannel.kt`
- Test: `android/editor/src/test/kotlin/com/laymaker/editor/EditorChannelTest.kt` (kotlinx-coroutines-test)

**Interfaces:**
- Consumes: Task 6, Task 7
- Produces: `internal class EditorChannel(scope: CoroutineScope, init: () -> JSONObject, handlers: Handlers)`
  - `interface Handlers { fun onUploadBegin(m: HostMessage.UploadBegin); fun onUploadChunk(m: HostMessage.UploadChunk); fun onOpenLink(href: String) }`
  - `fun onMessage(raw: String, reply: (String) -> Unit)` — 받은 `reply`를 마지막 회신 경로로 기억한다.
  - `suspend fun call(method: String, args: List<Any?> = emptyList()): Any?` (`ok:false`면 `LayEditorException("CALL_FAILED", error)`)
  - `fun post(method: String, args: List<Any?> = emptyList())` (결과를 기다리지 않음)
  - `fun send(message: NativeMessage)` (업로드 응답용)
  - `val events: SharedFlow<LayEvent>`, `val html: String` (마지막 `Change`), `val isReady: Boolean`
  - `fun close()`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `answers hello with init`: `hello` 수신 → `reply`로 `init` 전송, 내용은 `init()` 결과.
  - `queues calls until ready`: 준비 전 `post("setHTML")`, `call("getHTML")` → 아무것도 보내지 않음. `ready` 수신 후 순서대로 두 `call` 전송, `result` 수신 시 `call`이 값으로 끝난다.
  - `methods outside the allow-list throw`: `call("destroy")` → `IllegalArgumentException`, 아무것도 보내지 않음.
  - `failed result throws CALL_FAILED`.
  - `emits events and tracks html`: `event change ["<p>x</p>"]` → `events`에 `Change`, `html == "<p>x</p>"`. `ready` → `Ready` 이벤트.
  - `fatal becomes an Error event`.
  - `close cancels pending calls`: 대기 중 `call`이 `CancellationException`으로 끝나고, `close()` 뒤 `post`/`onMessage`는 예외 없이 무시된다.
  - `ignores malformed messages`: `onMessage("{", reply)` → 이벤트 없음, 예외 없음.
  - `routes upload and link messages to handlers`.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 호출 id는 1부터 증가, 대기 결과는 `Map<Long, CompletableDeferred<Any?>>`. 메서드 이름 검사는 `Protocol.METHODS`.
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat(android): add the editor channel with a ready queue and call results`

### Task 9: 업로드 수신 (`UploadReceiver`)

**Files:**
- Create: `android/editor/src/main/kotlin/com/laymaker/editor/LayUploader.kt`, `android/editor/src/main/kotlin/com/laymaker/editor/internal/UploadReceiver.kt`
- Test: `android/editor/src/test/kotlin/com/laymaker/editor/UploadReceiverTest.kt`

**Interfaces:**
- Consumes: Task 6, Task 8(`EditorChannel.send`)
- Produces:
  - `fun interface LayUploader { suspend fun upload(file: LayUploadFile, onProgress: (Float) -> Unit): LayUploadResult }`, `data class LayUploadFile(val file: File, val name: String, val mimeType: String, val size: Long)`, `data class LayUploadResult(val url: String, val alt: String? = null)`
  - `internal class UploadReceiver(dir: File, uploader: LayUploader, scope: CoroutineScope, send: (NativeMessage) -> Unit) { fun begin(m: HostMessage.UploadBegin); fun chunk(m: HostMessage.UploadChunk); fun cancelAll() }`

- [ ] **Step 1: 실패하는 테스트 작성** (임시 폴더)
  - `reassembles chunks and calls the uploader`: 조각 3개 → 업로더가 받은 파일의 바이트가 원본과 같고 `name`, `mimeType`, `size`가 맞다. `UploadDone(url, alt)` 전송.
  - `10MB upload reassembles 20 chunks byte for byte`.
  - `forwards progress`: 업로더가 `onProgress(0.5f)` → `UploadProgress(id, 0.5)`.
  - `uploader exception becomes UploadDone error and the temp file is deleted`.
  - `cancelAll deletes temp files and reports an error for each pending upload`.
  - `size mismatch or out-of-order index fails the upload`: 합친 크기가 `size`와 다르거나 `index`가 순서를 벗어나면 `UploadDone(error)`, 파일 삭제.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — `java.util.Base64` 디코딩, 파일 이름은 `File.createTempFile(LayDefaults.UPLOAD_PREFIX, null, dir)`(원본 이름을 경로에 쓰지 않음). `LayDefaults`에 `UPLOAD_PREFIX = "laymaker-upload"` 추가.
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat(android): receive chunked uploads and hand them to the app uploader`

### Task 10: 상태 저장 (`HtmlStateStore`)

**Files:**
- Create: `android/editor/src/main/kotlin/com/laymaker/editor/internal/HtmlStateStore.kt`
- Test: `android/editor/src/test/kotlin/com/laymaker/editor/HtmlStateStoreTest.kt`

**Interfaces:**
- Produces: `@RestrictTo(LIBRARY_GROUP) class HtmlStateStore(dir: File, inlineLimit: Int = LayDefaults.STATE_INLINE_LIMIT) { fun save(html: String): SavedHtml; fun restore(saved: SavedHtml): String? }`, `sealed interface SavedHtml : Parcelable { Inline(html: String); InFile(name: String) }` (Compose 모듈도 쓰므로 `@RestrictTo` 공개)

- [ ] **Step 1: 실패하는 테스트 작성**
  - `keeps short documents inline`: 1KB → `Inline`.
  - `stores a 2MB document in a file`: 2MB → `InFile`, `restore`가 원문을 돌려주고 파일을 지운다.
  - `restore of a missing file returns null`.
  - `limit counts UTF-8 bytes`: 한글 100,000자(약 300KB UTF-8) → `InFile`.
- [ ] **Step 2: 실패 확인** — FAIL
- [ ] **Step 3: 구현** — 파일 이름은 `File.createTempFile(LayDefaults.STATE_PREFIX, null, dir)`. `LayDefaults`에 `STATE_PREFIX = "laymaker-state"` 추가.
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat(android): save editor HTML across recreation without hitting the Bundle limit`

### Task 11: `LayEditorView`

**Files:**
- Create: `LayEditorView.kt`, `internal/WebViewFactory.kt`, `internal/ExternalLinks.kt`, `internal/FileChooser.kt`, `android/editor/src/main/res/values/ids.xml`(필요 시)
- Test: `android/editor/src/test/kotlin/com/laymaker/editor/LayEditorViewTest.kt`, `ExternalLinksTest.kt`, `FileChooserTest.kt` (Robolectric)

**Interfaces:**
- Consumes: Task 5~10
- Produces:
  - `class LayEditorView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : FrameLayout`
    - `fun start(options: LayEditorOptions = LayEditorOptions(), uploader: LayUploader? = null, extraPaths: Map<String, WebViewAssetLoader.PathHandler> = emptyMap())` (두 번째 호출은 `IllegalStateException`)
    - `val events: SharedFlow<LayEvent>`, `val html: String`, `var handleInsets: Boolean = true`
    - `suspend fun getHtml(): String`, `suspend fun getText(): String`, `suspend fun isEmpty(): Boolean`, `suspend fun exec(command: String, vararg args: Any?): Boolean`, `suspend fun can(command: String): Boolean`, `suspend fun isActive(name: String, attrs: Map<String, Any?> = emptyMap()): Boolean`
    - `fun setHtml(html: String)`, `fun focus()`, `fun blur()`, `fun setEditable(editable: Boolean)`, `fun setTheme(theme: LayTheme)`, `fun setLocale(locale: String?)`, `fun clearDraft()`, `fun destroy()`
  - `internal object ExternalLinks { fun intentFor(url: String): Intent? }`
  - `internal object FileChooser { enum class Kind { IMAGES, DOCUMENTS }; fun kindFor(acceptTypes: Array<String>): Kind; fun mimeTypes(acceptTypes: Array<String>): Array<String> }` + 등록 클래스 `FileChooserLauncher(owner: ActivityResultRegistryOwner, key: String)`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `ExternalLinksTest`: `https://a.b` → `ACTION_VIEW` 인텐트, `mailto:`·`tel:` 허용, `javascript:`·`file:`·`intent:` → `null`.
  - `FileChooserTest`: `["image/png","image/jpeg"]` → `IMAGES`, `["image/*","application/pdf"]` → `DOCUMENTS`, 빈 배열 → `DOCUMENTS`와 `*/*`.
  - `LayEditorViewTest` (Robolectric, `ComponentActivity`에 붙여서):
    - `applies the security settings`: JS 켬, DOM 저장소 켬, `allowFileAccess`·`allowContentAccess` 끔, 혼합 콘텐츠 `MIXED_CONTENT_NEVER_ALLOW`, `textZoom == (fontScale * 100).toInt()`.
    - `loads the bundled host page`: `start()` 뒤 마지막 로드 URL이 `https://appassets.androidplatform.net/laymaker/host.html`.
    - `start twice throws`.
    - `reports WEBVIEW_UNSUPPORTED when the message listener is unavailable`: Robolectric WebView는 `WEB_MESSAGE_LISTENER`를 지원하지 않으므로 `events`에 `Error("WEBVIEW_UNSUPPORTED")`.
    - `ime insets become bottom padding`: IME 높이 600px 인셋 전달 → 하단 여백 600. `handleInsets = false`면 0.
    - `auto theme follows a night mode change`: `onConfigurationChanged`로 야간 모드 전환 시 채널로 `setTheme("dark")` 호출이 대기열에 들어간다(채널 대기열 내용으로 확인).
    - `restores saved html into the next start`: `onSaveInstanceState` → 새 뷰에 `onRestoreInstanceState` → `start()`의 `init.content`가 저장된 HTML.
    - `two editors keep separate state keys`: 같은 액티비티의 두 뷰(id 다름)가 저장·복원 후 각자 자기 HTML을 되찾는다.
    - `reports FILE_CHOOSER_UNAVAILABLE without a result registry`: `ActivityResultRegistryOwner`가 아닌 context에서 파일 선택 요청 → `Error("FILE_CHOOSER_UNAVAILABLE")`, 콜백에 `null` 전달.
    - `renderer gone recreates the web view`: `onRenderProcessGone` 호출이 `true`를 돌려주고 `Error("RENDERER_GONE")`를 내보내며, 새 WebView가 붙는다.
- [ ] **Step 2: 실패 확인** — `./gradlew :editor:testDebugUnitTest` FAIL
- [ ] **Step 3: 구현.**
  - `WebViewFactory`가 WebView 생성, 설정(위 표), `WebViewAssetLoader`(`Protocol.ASSET_HOST`, `Protocol.ASSET_PATH` → `AssetsPathHandler`, 그리고 `extraPaths`), `WebViewClient`(자산 가로채기, 다른 URL 이동은 `ExternalLinks`로 넘기고 막음, `onRenderProcessGone`), `WebChromeClient`(`onShowFileChooser` → `FileChooserLauncher`)를 맡는다. WebView 자동 어둡게 하기 끔(`WebSettingsCompat`, 지원할 때만).
  - 메시지 리스너는 `WebViewFeature.isFeatureSupported(WEB_MESSAGE_LISTENER)`일 때만 `Protocol.OBJECT_NAME`, 허용 출처 `https://${Protocol.ASSET_HOST}`로 등록한다.
  - `ActivityResultRegistryOwner`는 `context`를 `ContextWrapper.baseContext`로 거슬러 찾는다. 등록 키는 `"laymaker-file-" + id`(id 없으면 `View.generateViewId()`). 없으면 `FILE_CHOOSER_UNAVAILABLE`.
  - 정리: `findViewTreeLifecycleOwner()`의 `ON_DESTROY` 또는 `destroy()`에서 채널 `close()`, 업로드 `cancelAll()`, WebView `destroy()`.
  - 상태 저장은 `BaseSavedState` 안에 `SavedHtml`. id가 없는 뷰는 저장하지 않는다(Android 뷰 규칙과 같음).
- [ ] **Step 4: 통과 확인** — PASS, `./gradlew :editor:lintDebug` 경고 없음(또는 근거 있는 baseline 없이 해결)
- [ ] **Step 5: 커밋** — `feat(android): add LayEditorView`

### Task 12: Compose 모듈

**Files:**
- Create: `android/editor-compose/build.gradle.kts`, `android/editor-compose/src/main/AndroidManifest.xml`, `android/editor-compose/src/main/kotlin/com/laymaker/editor/compose/LayEditor.kt`
- Test: `android/editor-compose/src/test/kotlin/com/laymaker/editor/compose/LayEditorStateTest.kt`
- Modify: `android/settings.gradle.kts`

**Interfaces:**
- Consumes: `LayEditorView`, `LayEvent`, `LayEditorOptions`, `LayUploader`, `HtmlStateStore` (Task 7~11)
- Produces:
  - `@Stable class LayEditorState(initialHtml: String) { var html: String (읽기 전용 공개, Compose 상태); val controller: LayEditorView?; internal fun bind(view: LayEditorView); internal fun unbind(); internal suspend fun collect(events: Flow<LayEvent>) }`
  - `@Composable fun rememberLayEditorState(initialHtml: String = ""): LayEditorState` (`rememberSaveable` + `HtmlStateStore`)
  - `@Composable fun LayEditor(state: LayEditorState, options: LayEditorOptions = LayEditorOptions(), modifier: Modifier = Modifier, uploader: LayUploader? = null, onEvent: (LayEvent) -> Unit = {})`

- [ ] **Step 1: 실패하는 테스트 작성** (Robolectric + `createComposeRule`)
  - `html follows change events`: 가짜 `Flow`로 `Change("<p>a</p>")` → `state.html == "<p>a</p>"`.
  - `initial html is passed as content`: `LayEditor`가 만든 뷰의 시작 옵션 `content`가 `initialHtml`.
  - `state survives recreation`: `StateRestorationTester`로 재생성 후 `html` 유지(긴 HTML 포함).
- [ ] **Step 2: 실패 확인** — `./gradlew :editor-compose:testDebugUnitTest` FAIL
- [ ] **Step 3: 구현** — `AndroidView(factory = { LayEditorView(it).apply { id = ...; start(...) } })`, 이벤트 수집은 `LaunchedEffect`. 로직은 `LayEditorView`에 두고 여기서 다시 만들지 않는다.
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: 커밋** — `feat(android): add the Compose wrapper`

### Task 13: 시험용 앱

**Files:**
- Create: `android/sample/build.gradle.kts`, `android/sample/src/main/AndroidManifest.xml`, `android/sample/src/main/kotlin/com/laymaker/editor/sample/{MainActivity,ViewScreenActivity,ComposeScreenActivity,DemoUploader}.kt`, `android/sample/src/main/res/layout/activity_view_screen.xml`, `android/sample/src/test/kotlin/com/laymaker/editor/sample/DemoUploaderTest.kt`
- Modify: `android/settings.gradle.kts`

**Interfaces:**
- Consumes: Task 11, Task 12
- Produces: `class DemoUploader(dir: File) : LayUploader` (파일을 `dir/uploads/`에 복사하고 `https://appassets.androidplatform.net/uploads/<이름>` 반환), 시작 화면에서 View 화면과 Compose 화면을 고른다. 두 화면 모두 `extraPaths = mapOf("/uploads/" to InternalStoragePathHandler(...))`.

- [ ] **Step 1: 실패하는 테스트 작성** — `DemoUploaderTest`: 업로드 후 파일이 `uploads/`에 있고 URL이 위 형식, 진행률 1.0 보고.
- [ ] **Step 2: 실패 확인** — `./gradlew :sample:testDebugUnitTest` FAIL
- [ ] **Step 3: 구현** — 시험용 앱은 `edge-to-edge`(targetSdk 37 기본)로 둔다. 다크 모드 전환 버튼, 언어 전환 버튼, 읽기 전용 버튼, "HTML 보기"(`getHtml()` 결과를 대화상자로) 버튼을 둔다.
- [ ] **Step 4: 통과 확인** — PASS, `./gradlew :sample:assembleDebug` 성공
- [ ] **Step 5: 커밋** — `feat(android): add the sample app`

### Task 14: 게시 설정과 문서

**Files:**
- Modify: `android/editor/build.gradle.kts`, `android/editor-compose/build.gradle.kts`, `android/gradle/libs.versions.toml`, `README.md`, `docs/usage.md`(13절 Android 추가), `docs/device-checklist.md`(Android 절 추가), `docs/decisions.md`(Android 판단 추가)

**Interfaces:**
- Consumes: 모든 모듈

- [ ] **Step 1: 게시 설정** — vanniktech `mavenPublishing { publishToMavenCentral(); coordinates(group, artifactId, version); pom { name, description, url = "https://github.com/galactic19/lay-editor", licenses MIT, developers, scm } }`. `signAllPublications()`는 서명 키 속성(`signingInMemoryKey`)이 있을 때만 켠다. 계정·키는 `ORG_GRADLE_PROJECT_mavenCentralUsername`, `ORG_GRADLE_PROJECT_mavenCentralPassword`, `ORG_GRADLE_PROJECT_signingInMemoryKey`, `ORG_GRADLE_PROJECT_signingInMemoryKeyPassword` 환경변수로만 받는다.
- [ ] **Step 2: 확인** — `./gradlew publishToMavenLocal` 성공. `~/.m2/repository/com/laymaker/editor-android/<package.json 버전>/`에 `.aar`, `.pom`, sources, javadoc이 있고 POM의 라이선스가 MIT, `editor-compose` POM이 `editor-android`에 의존한다.
- [ ] **Step 3: 문서**
  - README: Android 빠른 시작(의존성 한 줄, XML/Kotlin 예제, Compose 예제).
  - usage.md 13절: 설치, `LayEditorView` API 표, 옵션, 이벤트, 업로드, 키보드(`handleInsets`), 상태 저장의 한계(디바운스 0.3초와 임시저장), 오류 코드 표, 게시 방법(환경변수 4개, `./gradlew publishToMavenCentral`).
  - device-checklist: Android 절(시험용 앱 설치 `./gradlew :sample:installDebug`, 키보드 위 툴바, Gboard·삼성 키보드 한글, 사진 선택기 업로드, 회전, 다크 모드, 글꼴 크기, 링크 열기).
  - decisions.md: Android 절(통신 방식 변경 이유, 계측 테스트를 만들지 않은 이유 등).
- [ ] **Step 4: 커밋** — `build(android): prepare Maven Central publishing and document Android usage`

### Task 15: 전체 검증, 버그 점검, PR 갱신

- [ ] **Step 1: 웹 전체 검증** — `npm run lint && npm run typecheck && npm test && npm run build && E2E_PORT=5173 npx playwright test --workers=3` 모두 통과
- [ ] **Step 2: Android 전체 검증** — `cd android && ./gradlew build :sample:assembleDebug publishToMavenLocal` 통과(lint, 단위 테스트 포함)
- [ ] **Step 3: 버그 점검 워크플로** — 관점별 찾기(웹 호스트·브리지 프로토콜, Kotlin 채널·업로드·상태, WebView 보안 설정, Compose, 문서대로 따라 하기) → 항목마다 독립 재현·반박 → 확정된 것은 재현 테스트를 먼저 쓰고 고친다.
- [ ] **Step 4: 다시 전체 검증** — Step 1, 2 반복
- [ ] **Step 5: 커밋·푸시와 PR 갱신** — `git push -u origin claude/lay-editor-v1`, PR #1 본문에 Android 절(모듈, 테스트 결과, 실기기 확인 필요 항목)을 추가한다.
