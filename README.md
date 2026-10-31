# lay-editor (`@laymaker/editor`)

어느 프로젝트에도 한 줄로 붙여 쓰는 리치 텍스트 에디터입니다.

- **어디서나**: 프레임워크 없이 동작합니다. `<script>` 한 줄, `import` 한 줄, `<textarea>` 교체, React·Vue 래퍼를 모두 지원합니다.
- **고기능**: 기본 서식, 색상, 목록·체크리스트, 이미지 업로드·크기 조절, 동영상, 표(병합·분할), 코드블록 문법 강조, 슬래시 메뉴, 찾기/바꾸기, HTML 소스, 자동 임시저장
- **모바일 친화**: 키보드 위에 붙는 툴바, 상황별 도구 전환, 바텀시트, 44px 터치 영역
- **한글 친화**: 한글 조합 입력 검증, Word·한글(HWP)·구글 문서 붙여넣기 정리, ko/en 언어팩
- **안전**: 입력·출력 모두 허용 목록 기반 XSS 정제

ProseMirror(MIT) 위에 만들었고, 의존성은 모두 MIT/ISC 라이선스입니다.

## 빠른 시작

```bash
npm install @laymaker/editor
```

```ts
import { createEditor } from '@laymaker/editor';
import '@laymaker/editor/style.css';

const editor = createEditor({
  element: '#editor',
  content: '<p>안녕하세요</p>',
  upload: async (file) => ({ url: await myUpload(file) }),
  onChange: (html) => save(html),
});
```

빌드 도구가 없다면:

```html
<link rel="stylesheet" href="dist/style.css" />
<textarea name="body"></textarea>
<script src="dist/editor.umd.js"></script>
<script>LayEditor.createEditor({ element: 'textarea[name=body]' });</script>
```

## 문서

- [사용 가이드](docs/usage.md): 옵션, 업로드, 이벤트, 보기 페이지, 테마, 언어팩, React/Vue, 사용자 확장, 단축키
- [실기기 체크리스트](docs/device-checklist.md)
- [구현 중 내린 판단과 남은 과제](docs/decisions.md)
- [설계 스펙](docs/superpowers/specs/2026-10-30-laymaker-editor-design.md)

## 개발

```bash
npm install
npm run dev        # http://localhost:5173/demo/
npm test           # 단위 테스트 (Vitest)
npm run test:e2e   # E2E (Playwright: 데스크톱·모바일 Chromium)
npm run build      # dist/ 생성 + 내보내기 검사 + 용량 검사
```

WebKit(iPhone) E2E는 WebKit 브라우저가 설치된 환경에서 `E2E_WEBKIT=1 npm run test:e2e`로 실행합니다.
