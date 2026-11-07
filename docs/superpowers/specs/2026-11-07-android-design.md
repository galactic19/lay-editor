# @laymaker/editor Android 지원 설계 스펙

- 작성일: 2026-11-07
- 상태: 리뷰 대기
- 선행 스펙: [2026-10-30-laymaker-editor-design.md](2026-10-30-laymaker-editor-design.md)

## 1. 목적

Android(Kotlin) 앱에서 `@laymaker/editor`를 한 줄 의존성으로 불러 쓰게 한다. 웹과 같은 기능, 같은 HTML 출력, 같은 한글 입력 품질을 낸다.

### 1.1 사용자가 정한 것

- 방식: 웹 에디터를 WebView로 감싸는 래퍼. 네이티브 에디터는 만들지 않는다.
- 배포: Maven Central(`com.laymaker`)용 게시 준비까지 한다. 실제 게시는 사용자가 한다.
- 버그 확인: Android WebView 환경까지 포함해 다시 점검한다.
- Rust: 사용해도 된다고 했지만, WebView 방식에서는 필요한 곳이 없어 쓰지 않는다.

### 1.2 합의한 전제

- 웹 에디터 코드는 그대로 쓴다. Android 전용 코드는 연결부(호스트 스크립트)와 Kotlin 라이브러리에만 둔다.
- 코드 원칙은 선행 스펙과 같다.
  - 클래스·함수 단위, DRY, 하드코딩 금지.
  - Kotlin 쪽 수치·이름은 한곳(`LayDefaults`, 공용 프로토콜 파일)에서 읽는다.
- UI 문구는 웹 에디터 언어팩(ko/en)을 그대로 쓴다. Kotlin 쪽에는 사용자에게 보이는 문구가 없다.

### 1.3 범위 밖

- 네이티브(Compose/EditText) 에디터, Rust 코어, iOS 래퍼
- 앱이 직접 그리는 네이티브 툴바(필요하면 `exec` API로 만들 수 있다)
- 실제 Maven Central 게시

### 1.4 성공 기준

1. Kotlin 앱이 `implementation("com.laymaker:editor-android:<버전>")` 한 줄과 `LayEditorView` 하나로 에디터를 띄운다.
2. 웹 데모에서 되는 기능이 모두 된다. 서식, 이미지 업로드, 표, 코드블록, 슬래시 메뉴, 찾기, 소스 보기, 전체 화면, 임시저장, 다크 모드, 언어 전환이 포함된다.
3. 이미지 업로드는 앱의 Kotlin `suspend` 함수 하나로 처리한다.
4. 키보드가 올라와도 툴바와 커서가 가려지지 않는다(edge-to-edge 앱 포함).
5. 화면 회전, 앱 복원, WebView 비정상 종료 후에도 내용이 남는다.
6. 이 환경에서 웹 테스트, Kotlin 단위 테스트, `./gradlew build`가 모두 통과한다.

## 2. 구조

```
lay-editor/
├─ src/hosts/android/
│  ├─ protocol.json       ← 메시지 이름·조각 크기·자산 경로의 단일 출처
│  ├─ protocol.ts         ← protocol.json 타입 래퍼
│  ├─ host.ts             ← WebView 안에서 에디터를 만들고 Kotlin과 통신
│  └─ host.html
├─ dist/android/          ← 빌드 결과 (host.html, host.js, style.css)
├─ tests/fixtures/android-protocol.json  ← 양쪽 테스트가 같이 쓰는 메시지 예제
└─ android/               ← Gradle 프로젝트
   ├─ gradle/libs.versions.toml
   ├─ editor/             → com.laymaker:editor-android
   ├─ editor-compose/     → com.laymaker:editor-compose
   └─ sample/             → 시험용 앱 (View 화면 + Compose 화면, 게시하지 않음)
```

### 2.1 단일 출처

| 값 | 출처 | 읽는 쪽 |
|---|---|---|
| 버전 | `package.json`의 `version` | npm, Gradle(`version`) |
| 메시지 이름, 조각 크기, 자산 경로 | `src/hosts/android/protocol.json` | TS(import), Kotlin(빌드 때 생성되는 `Protocol.kt`) |
| 웹 자산 | `dist/android/` | Gradle이 `editor`의 assets로 복사 |

Gradle 빌드는 `npm run build`를 먼저 실행하는 작업에 의존한다. 웹 코드가 바뀌면 AAR 자산도 다시 만들어진다. 입력과 출력을 선언해 바뀐 것이 없으면 건너뛴다.

### 2.2 모듈과 환경

- `editor`: View 기반 라이브러리. 의존성은 `androidx.webkit`, `androidx.activity`, `kotlinx-coroutines-android`만 둔다.
- `editor-compose`: `editor`를 Compose로 감싼 얇은 모듈. Compose를 쓰지 않는 앱이 Compose 의존성을 떠안지 않게 분리한다(React/Vue 래퍼와 같은 방식).
- `sample`: 두 모듈을 쓰는 시험용 앱. 데모 업로드는 이미지를 앱 캐시에 저장하고 `https://appassets.androidplatform.net` 아래 주소를 돌려준다.
- minSdk 24(Android 7.0). 이 버전부터 WebView가 Play 스토어로 업데이트되어 최신 Chromium을 기대할 수 있다.
- compileSdk·targetSdk는 최신 안정 플랫폼(작성 시점 android-37)으로 한다. AGP는 9.x이고, Gradle은 래퍼로 고정한다.
- Kotlin, AGP, 라이브러리 버전은 `libs.versions.toml` 한곳에 둔다. 정확한 버전 숫자는 구현 계획 첫 작업에서 실제로 받을 수 있는 버전을 확인해 고정한다.

## 3. 웹 호스트 (`src/hosts/android`)

`host.html`은 `style.css`와 `host.js`를 불러오는 빈 페이지다. `host.js`는 에디터를 포함한 IIFE 번들이다(Vite의 별도 진입점, 번들러 설정은 기존 UMD 설정을 재사용).

`host.ts`가 하는 일:

1. Kotlin이 주입한 `window.LayBridge`(WebMessageListener 객체)를 찾는다. 없으면 아무것도 하지 않는다.
2. `hello`를 보내고 `init`(옵션)을 기다린다.
3. `createEditor`로 에디터를 만든다. 업로드 함수는 파일을 조각으로 보내고 Kotlin의 결과를 기다리는 함수로 넣는다.
4. 에디터 이벤트를 Kotlin으로 넘긴다.
5. Kotlin의 메서드 호출을 실행하고 결과를 돌려준다.
6. 링크 열기(`window.open`)를 Kotlin에 넘겨 외부 브라우저로 연다.

## 4. 메시지 프로토콜

통신은 `androidx.webkit`의 `WebViewCompat.addWebMessageListener` 하나로 한다.

- 웹 → Kotlin: `LayBridge.postMessage(JSON 문자열)`.
- Kotlin → 웹: 첫 메시지와 함께 받은 `JavaScriptReplyProxy.postMessage(JSON 문자열)`. 웹은 `LayBridge.onmessage`로 받는다.
- 허용 출처는 자산 주소(`https://appassets.androidplatform.net`) 하나뿐이다.
- 모든 메시지는 `{ "type": 이름, ... }` 형태의 JSON이다. 직접 JS 코드를 문자열로 만들어 실행하지 않으므로 이스케이프 문제가 없다.

> 섹션 3 승인 때는 Kotlin → 웹 경로를 `evaluateJavascript`로 설명했다. 같은 채널의 reply proxy를 쓰면 JS 문자열 이스케이프가 필요 없어 더 안전하고 단순하므로 이쪽으로 바꾼다.

| 방향 | type | 내용 |
|---|---|---|
| 웹 → K | `hello` | 호스트 준비됨, 프로토콜 버전 |
| K → 웹 | `init` | 에디터 옵션(JSON) |
| 웹 → K | `ready` | 에디터 생성 완료 |
| 웹 → K | `event` | `name`, `args` (change, focus, blur, selectionChange, upload*, error, modeChange) |
| K → 웹 | `call` | `id`, `method`, `args` |
| 웹 → K | `result` | `id`, `ok`, `value` 또는 `error` |
| 웹 → K | `uploadBegin` | `id`, `name`, `mime`, `size`, `chunks` |
| 웹 → K | `uploadChunk` | `id`, `index`, `data`(base64) |
| K → 웹 | `uploadProgress` | `id`, `ratio` |
| K → 웹 | `uploadDone` | `id`, `url`, `alt?` 또는 `error` |
| 웹 → K | `openLink` | `href` |
| 웹 → K | `fatal` | 에디터 생성 실패(`code`, `message`) |

- 조각 크기는 `protocol.json`의 값(512KB)을 쓴다.
- 허용된 `call` 메서드는 공개 API 목록과 같다: getHTML, setHTML, getText, isEmpty, exec, can, isActive, focus, blur, setEditable, setTheme, setLocale, clearDraft. 목록에 없는 메서드는 `error`로 거절한다.

## 5. Kotlin API

### 5.1 `LayEditorView` (패키지 `com.laymaker.editor`)

```kotlin
val editor = findViewById<LayEditorView>(R.id.editor)
editor.start(
    LayEditorOptions(content = "<p>안녕하세요</p>", placeholder = "내용을 입력하세요", theme = LayTheme.AUTO),
    uploader = LayUploader { file, onProgress -> LayUploadResult(url = api.upload(file.file, onProgress)) },
)
lifecycleScope.launch { editor.events.collect { if (it is LayEvent.Change) viewModel.save(it.html) } }
val html = editor.getHtml()
editor.setHtml("<p>새 글</p>")
editor.exec("toggleBold")
editor.setEditable(false); editor.setTheme(LayTheme.DARK); editor.setLocale("en")
editor.html  // 마지막으로 받은 내용, 즉시 읽기
```

| 멤버 | 설명 |
|---|---|
| `start(options, uploader?)` | 에디터 시작. 한 번만 부른다 |
| `events: SharedFlow<LayEvent>` | 이벤트 흐름 |
| `html: String` | 마지막 `change`로 받은 HTML |
| `suspend getHtml() / getText() / isEmpty()` | 웹 메서드 결과 |
| `suspend exec(command, vararg args) / can(command) / isActive(name, attrs)` | 명령 실행과 상태 |
| `setHtml, focus, blur, setEditable, setTheme, setLocale, clearDraft` | 결과가 필요 없는 호출 |

- 준비 전에 부른 메서드는 대기열에 넣었다가 `ready` 뒤 순서대로 실행한다. `suspend` 메서드는 그때까지 기다린다.
- 뷰가 해제되면 대기 중인 `suspend` 호출은 `CancellationException`으로 끝난다.

### 5.2 `LayEditorOptions`

- 타입이 있는 필드: `content`, `preset`, `toolbar`, `locale`, `theme`, `placeholder`, `changeDebounce`, `disable`.
- `extra: Map<String, Any?>`: 확장별 옵션. 웹 `createEditor`에 그대로 넘긴다.
- `theme = LayTheme.AUTO`는 앱의 낮/밤 모드(`Configuration.uiMode`)로 정해지고, 바뀌면 다시 반영한다.
- `locale = null`이면 기기 언어를 넘긴다. 웹이 `ko-KR → ko`처럼 맞춘다.

### 5.3 이벤트 `LayEvent`

`Ready`, `Change(html)`, `Focus`, `Blur`, `SelectionChange`, `UploadStart(name)`, `UploadProgress(name, ratio)`, `UploadSuccess(name, url)`, `UploadError(name, code, message)`, `ModeChange(mode)`, `Error(code, message)`.

웹 `update` 이벤트는 키 입력마다 생겨서 넘기지 않는다.

### 5.4 업로드 `LayUploader`

```kotlin
fun interface LayUploader {
    suspend fun upload(file: LayUploadFile, onProgress: (Float) -> Unit): LayUploadResult
}
data class LayUploadFile(val file: File, val name: String, val mimeType: String, val size: Long)
data class LayUploadResult(val url: String, val alt: String? = null)
```

- 형식·용량 검사는 웹에서 먼저 한다. 통과한 파일만 Kotlin으로 온다.
- Kotlin은 조각을 앱 캐시의 임시 파일로 합친 뒤 업로드 함수를 부른다. 끝나면(성공, 실패, 취소 모두) 임시 파일을 지운다.
- 업로드 함수가 예외를 던지면 웹에 오류로 돌려준다. 웹은 기존 "업로드 실패" 안내를 띄운다.
- `uploader`가 없으면 웹 옵션에서도 `upload`를 빼서 지금처럼 업로드 기능이 숨겨진다.

### 5.5 Compose (`com.laymaker.editor.compose`)

```kotlin
val state = rememberLayEditorState(initialHtml = post.body)
LayEditor(state, options, uploader, Modifier.fillMaxSize())
Button(onClick = { save(state.html) }) { Text("저장") }
scope.launch { state.controller?.exec("toggleBold") }
```

- `state.html`은 Compose 상태라 화면이 자동으로 갱신된다.
- `state.controller`는 준비된 뒤의 `LayEditorView` 제어 객체다.
- 내부는 `AndroidView`로 `LayEditorView`를 감싼다. 로직을 다시 구현하지 않는다.

## 6. 내부 동작

### 6.1 로딩

- `WebViewAssetLoader`로 `https://appassets.androidplatform.net/laymaker/host.html`을 연다.
- 앱 내부 이미지(sample)는 같은 로더의 다른 경로로 제공한다.

### 6.2 파일 선택

- Android WebView는 `<input type=file>`을 스스로 처리하지 못하므로 `WebChromeClient.onShowFileChooser`를 구현한다.
- 요청한 형식이 이미지뿐이면 사진 선택기(`PickMultipleVisualMedia`), 아니면 문서 선택기(`OpenMultipleDocuments`)를 연다.
- 등록에 필요한 `ActivityResultRegistry`는 뷰의 context를 거슬러 올라가 `ActivityResultRegistryOwner`(보통 `ComponentActivity`)에서 얻는다. 없으면 선택 창을 열지 않고 `Error("FILE_CHOOSER_UNAVAILABLE")`을 보낸다.

### 6.3 키보드와 화면

- 키보드 위 툴바는 웹 에디터의 것을 그대로 쓴다.
- 뷰가 `WindowInsetsCompat`의 IME·시스템 바 높이를 아래 여백으로 반영한다. edge-to-edge 앱에서도 WebView가 키보드만큼 줄어들어 툴바와 커서가 보인다. 앱이 이미 처리하면 `handleInsets = false`로 끈다.
- `textZoom`을 시스템 글꼴 크기(`fontScale`)에 맞춘다.

### 6.4 링크와 이동

- WebView 안의 페이지 이동은 모두 막는다.
- `openLink` 메시지와 새 창 요청은 `ACTION_VIEW` 인텐트로 외부 앱에 넘긴다. `http`, `https`, `mailto`, `tel`만 허용한다.

### 6.5 상태 저장

- `onSaveInstanceState`가 `html`을 저장한다.
- 크기가 기준(`LayDefaults`)을 넘으면 앱 캐시 파일에 쓰고 Bundle에는 파일 키만 넣는다. 복원 후 파일을 지운다.
- 복원된 내용은 `start`의 `content`보다 우선한다.
- `change` 디바운스(기본 0.3초) 안의 입력은 웹 임시저장(`autosave`)이 복구한다. 임시저장이 꺼져 있으면 그 사이 입력은 잃을 수 있다고 문서에 적는다.

### 6.6 WebView 비정상 종료

- `onRenderProcessGone`에서 `true`를 돌려 앱이 죽지 않게 한다.
- WebView를 새로 만들고 마지막 `html`로 다시 시작한 뒤 `Error("RENDERER_GONE")`을 보낸다.

### 6.7 보안 설정

| 설정 | 값 | 이유 |
|---|---|---|
| JavaScript | 켬 | 에디터 동작 |
| DOM 저장소 | 켬 | 임시저장 |
| 파일·콘텐츠 접근 | 끔 | 자산 로더만 사용 |
| 혼합 콘텐츠 | 막음 | http 이미지 차단 |
| 자동 어둡게 하기 | 끔 | 다크 모드는 테마가 처리 |
| 메시지 허용 출처 | 자산 주소 하나 | 다른 페이지의 메시지 차단 |

### 6.8 오류

| 코드 | 시점 |
|---|---|
| `WEBVIEW_UNSUPPORTED` | 기기 WebView가 `WEB_MESSAGE_LISTENER`를 지원하지 않음 |
| `RENDERER_GONE` | WebView 렌더러 종료 후 복구함 |
| `FILE_CHOOSER_UNAVAILABLE` | 파일 선택 창을 열 수 없음 |
| `CALL_FAILED` | 웹 메서드 호출 실패. `suspend` 호출은 `LayEditorException`을 던짐 |
| 웹 오류 코드 | `EXTENSION_FAILED`, `UPLOAD_FAILED` 등 웹 에디터 코드를 그대로 전달 |

## 7. 테스트

이 환경에는 Android 에뮬레이터를 돌릴 KVM이 없다. 그래서 세 층으로 나눠 검증한다.

1. **웹 호스트**
   - Vitest: `host.ts`의 메시지 처리, 호출 허용 목록, 조각 나누기, 대기열.
   - Playwright(데스크톱·모바일 Chromium): `host.html`을 열고 가짜 `LayBridge`를 주입한다. 가짜 브리지가 Kotlin 역할을 하며 init, 호출, 업로드 왕복, 링크 열기, 한글 조합 입력을 검증한다.
2. **Kotlin**
   - JVM 단위 테스트: 메시지 인코딩·디코딩, 옵션 → JSON, 조각 합치기와 임시 파일 정리, 호출 대기열과 취소, 상태 저장 기준.
   - Robolectric: 뷰 연결, WebView 설정, 인셋 처리, 파일 선택 등록.
   - 공용 예제(`tests/fixtures/android-protocol.json`)를 TS와 Kotlin 테스트가 같이 읽어 양쪽 형식이 어긋나지 않게 한다.
3. **빌드**
   - Android SDK를 설치하고 `./gradlew build`(lint, 단위 테스트 포함)와 `:sample:assembleDebug`가 통과하는지 확인한다.
   - 실기기 확인 항목은 `docs/device-checklist.md`에 Android 절로 추가한다.

## 8. 버그 점검

1. 웹 전체 검증(lint, typecheck, 단위, 빌드, E2E)을 다시 돌린다.
2. 새 호스트·Kotlin 코드와 Android 전용 경로를 대상으로 버그 찾기 워크플로를 돌린다. 찾은 항목은 독립 검증 후 재현 테스트와 함께 고친다.

## 9. 배포

- `com.vanniktech.maven.publish` 플러그인으로 `editor`와 `editor-compose`를 게시한다(sources, javadoc, POM, 서명 포함).
- 좌표: `com.laymaker:editor-android`, `com.laymaker:editor-compose`. 버전은 `package.json`에서 읽는다.
- Sonatype 계정과 서명 키는 환경변수(`ORG_GRADLE_PROJECT_mavenCentralUsername` 등)로만 받는다. 저장소에는 비밀 값을 두지 않는다.
- 게시 명령: `./gradlew publishToMavenCentral`. 사용자가 직접 실행한다.
- 문서: README와 `docs/usage.md`에 Android 절(설치, View, Compose, 업로드, 이벤트, 키보드, 게시 방법)을 추가한다.
