# OW Compass

개인 Windows PC에서 쓰는 오버워치 5대5 역할 고정 경쟁전 추천 앱입니다. 공개 서버나 서비스 배포가 목적이 아닙니다.

## 사용 흐름

1. Codex 대화에서 공식 통계·패치·상성 근거를 검토하고 메타 JSON을 작성합니다.
2. 앱의 **메타 · 설정 → 메타 파일 적용**에서 JSON을 불러옵니다. 검증 실패 시 기존 자료를 유지합니다.
3. 전장, 내 역할, 아군·상대 영웅을 선택하면 로컬 순위가 즉시 계산됩니다.
4. **AI로 추천 정렬**은 저장된 메타와 입력한 경기 상황만 사용합니다. 앱에서 메타 조사나 웹 검색을 하지 않습니다.

새 설치에는 `meta/current.json`이 포함됩니다. 2026-09-29 수집한 아시아 전체 티어 통계(53영웅·30전장) 기반 **초기 비교 자료**입니다. 임시 티어와 제한적인 능력 기반 상성 5개·시너지 8개가 포함되어 있으며, 추천 정확도가 검증된 완성 메타가 아닙니다. 자세한 판단은 [메타 데이터 검토](docs/META_DATA_REVIEW.md)를 읽어 주세요.

## Windows 앱

`artifacts/desktop/OW-Compass-0.1.0-Windows.exe`를 실행합니다. 휴대용 실행 파일이며 개인 PC에서 사용합니다. Node.js를 따로 설치할 필요가 없습니다. 현재 실행 파일은 코드 서명과 맞춤 아이콘이 없습니다.

앱 데이터는 Electron `userData` 아래 저장합니다. Windows에서는 `%APPDATA%` 아래의 앱 사용자 데이터 폴더입니다. 메타와 설정은 `data/`, 키는 `credentials.enc.json`에 Windows DPAPI로 암호화하여 저장합니다. 키는 같은 Windows 계정에서 사용하며 다른 Windows 계정으로 암호화 파일만 복사하면 복호화되지 않을 수 있습니다. 화면/API에 키 원문을 반환하지 않습니다.

기본 추천 제공자는 Gemini 2.5 Flash, 추론 노력 low입니다. 앱 설정에서 직접 키를 입력할 수 있습니다. 무료 티어 사용 가능 여부와 한도는 Google 프로젝트에 달려 있습니다. 앱이 무료 과금을 강제할 수는 없습니다. 자동 재시도나 다른 유료 제공자로의 자동 전환은 없습니다. OpenAI를 직접 선택하면 별도 OpenAI API 과금이 적용됩니다.

추천 버튼 한 번에 모델 요청 최대 1회, 동일한 메타·맵·조합·제공자·모델·노력의 성공 결과는 30분 재사용합니다. 키가 없거나 요청이 실패하면 로컬 점수를 표시합니다. 진행 중인 추천이 있으면 종료 전 안내하며, 이전에 저장한 메타는 유지합니다.

## 개발 및 검증

Node.js 22.12 이상을 사용합니다.

```sh
npm ci
npm test
npm run build
npm run desktop:bundle
npm run desktop:package
```

마지막 명령은 Windows 휴대용 파일만 만들고 게시하지 않습니다. 개발용 웹 실행은 `npm run dev`, 빌드된 웹 실행은 `npm start`입니다. 이 경우 `.env.example`을 참고해 서버에만 키를 설정합니다. 데스크톱 앱은 실행 셸의 키를 자동으로 가져오지 않습니다.

Electron의 설치 스크립트가 차단된 환경에서는 `npm run desktop`에 필요한 로컬 런타임이 없을 수 있습니다. `desktop:package`가 만든 `artifacts/desktop/win-unpacked/OW Compass.exe`로 실행할 수 있습니다.

## Codex에서 메타 갱신

공개 통계 수집은 개발용 도구이며 앱 런타임과 분리되어 있습니다.

```sh
npm run data:collect -- diamond artifacts/statistics-diamond.json
npx tsx scripts/prepare-meta.ts artifacts/statistics-diamond.json artifacts/meta-diamond.json
```

`prepare-meta.ts`는 재현 가능한 **초기 통계 비교치**를 만듭니다. 이것만 실행했다고 Astra의 종합 메타 분석이나 추천 정확도 검증이 완료되는 것은 아닙니다. Codex에서 근거와 적용 범위를 검토한 뒤 앱에 적용하세요. 다른 티어를 쓰려면 해당 티어로 작성한 JSON을 적용합니다. 파일 하나만 활성화되며 재시작 후에도 유지됩니다. 프로젝트 기본 메타를 바꾸려면 검토한 파일을 `meta/current.json`에 반영하고 다시 빌드합니다.

OverFast API는 아시아 전체의 대체 통계이며 KR 전용으로 표시하지 않습니다. GM에는 챔피언이 포함됩니다. 원본 통계의 결측과 캐시 상태를 보존하며, 상성이 없으면 미확인으로 표시합니다. 계산에서는 가감점 0을 사용하지만 실제 중립 상성을 입증하는 것은 아닙니다. 7개 제외 전장의 이유는 앱 통계 패널과 검토 문서에 있습니다.

## 검증 범위

- 자동 테스트: 역할·중복·참조 검증, 원자적 저장, 메타 주입, 캐시/중복 요청, 키 비공개, 암호화 저장 실패, Gemini 모의 응답/한도/잘린 출력.
- Windows 패키지 스모크: 창 콘텐츠 로드, loopback 서버, DPAPI 암복호화.
- 브라우저: 공통 렌더러의 맵/역할/영웅 입력, 키 없는 추천, 설정과 제외 맵 표시.
- 실제 Gemini/OpenAI 호출, 네이티브 키 입력 및 실게임 추천 정확도는 검증하지 않았습니다. 실제 AI 호출은 0회입니다.

[현재 작업 기록](docs/HANDOFF.md) · [프로젝트 방향](docs/PROJECT_BRIEF.md) · [메타 데이터 검토](docs/META_DATA_REVIEW.md)

Overwatch와 게임 자산의 권리는 Blizzard Entertainment에 있습니다. 비공식 개인 도구입니다.
