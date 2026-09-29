# 오버워치 메타 데이터 검토

확인일: 2026-09-29. 대상은 PC 일반 5대5 역할 고정 경쟁전이다. 스타디움 랭크는 별도 모드다. 실제 게임 클라이언트로 매칭한 검증은 하지 않았다.

## 7개 제외 맵의 판정

| API ID | 판정 | 일반 경쟁전 추천에 포함 |
|---|---|---|
| arena-victoriae | 스타디움 쟁탈 전장 | 아니오 |
| gogadoro | 스타디움 쟁탈 전장(고가도로) | 아니오 |
| place-lacroix | 스타디움 밀기 전장 | 아니오 |
| redwood-dam | 스타디움 밀기 전장 | 아니오 |
| wuxing-university | 스타디움 쟁탈 전장, Water College | 아니오 |
| hanaoka | 격돌 전장. 일반 경쟁전에서 제거, 스타디움 버전은 별도 | 아니오 |
| throne-of-anubis | 격돌 전장. 일반 경쟁전에서 제거, 스타디움 버전은 별도 | 아니오 |

한국어 공식 2025-02-19 패치는 하나오카·아누비스의 왕좌의 경쟁전 제외를 명시한다. 2026-02-11 패치는 격돌의 빠른 대전 제외와 스타디움 잔류를 명시한다. 영문 날짜는 시차 때문에 각각 2월 18일, 2월 10일이다. 따라서 과거 경쟁전 등장 영상은 현재 등장 근거가 아니다.

- [2025년 2월 공식 패치](https://overwatch.blizzard.com/ko-kr/news/patch-notes/live/2025/02/)
- [2026년 2월 공식 패치](https://overwatch.blizzard.com/ko-kr/news/patch-notes/live/2026/02/)
- [공식 스타디움 소개와 전장 도표](https://overwatch.blizzard.com/en-us/news/24188046/)
- [Wuxing University 공식 스타디움 소개](https://news.blizzard.com/en-us/article/24246206/overwatch-spotlight-the-reign-of-talon-begins)
- [Wuxing University 추가 공식 패치](https://overwatch.blizzard.com/en-us/news/patch-notes/live/2025/12/)
- 제작 참여자의 설명: [Gogadoro](https://pixelbutterfly.artstation.com/projects/AZDm4z), [Place Lacroix](https://pixelbutterfly.artstation.com/projects/wrnXK9), [Redwood Dam](https://benjamin_sauder.artstation.com/projects/YGVbv3)

2026-09-29 직접 읽은 [Blizzard 한국어 통계 페이지](https://overwatch.blizzard.com/ko-kr/rates/)에서 역할 고정 경쟁전 필터 값은 `rq=2`이며, 해당 모드를 지원하는 전장 옵션은 30개였다. 수집된 OverFast의 30개와 ID 집합이 정확히 일치했다. 공식 페이지에만 있거나 API에만 있는 전장은 0개였다. 이번 7개는 현재 일반 경쟁전 전장 통계의 누락으로 볼 근거가 없다. 이 대조는 현재 공개 페이지를 기준으로 한 확인이며, 미래 패치나 일시적인 게임 내 비활성화까지 보장하지 않는다.

원인: OverFast의 `/maps`는 모든 모드의 목록이며 `control`, `push` 등 전장 유형만으로 스타디움 전용 여부를 구분할 수 없다. 기존 수집기가 이 유형으로 후보 37개를 뽑았다. [OverFast 파서](https://github.com/TeKrop/overfast-api/blob/main/app/domain/parsers/hero_stats_summary.py)는 Blizzard 응답의 선택된 맵이 요청 맵과 다르면 400을 반환한다. 따라서 400을 임의로 해당 맵의 승률 0%로 채우면 안 된다.

## 공식 통계 + Astra의 신뢰 범위

공식 승률·픽률·밴률과 맵/티어별 차이는 메타의 기본 근거로 적합하다. 그러나 이 주변 통계만으로 특정 두 영웅의 상성, 아군 조합의 상승효과, 10인 조합의 승리 확률을 식별할 수 없다. 이들은 조건부 관측 자료가 필요하다. Astra는 자료 비교, 패치 해석, 능력 상호작용 정리, 근거가 있는 JSON 작성에 사용할 수 있지만 관측되지 않은 표본이나 상성 승률을 만들어 실측값으로 취급할 수는 없다.

[공식 통계 FAQ](https://overwatch.blizzard.com/en-us/rates/?input=PC)는 최근 패치 시작 이후 집계, 신규 패치 반영에 최대 하루 지연, 표본 부족 시 `--` 표시를 설명한다. 기존의 “집계 기간을 전혀 알 수 없다”는 표현은 부정확하다. 정확히는 API 응답에서 특정 집계 시작/종료 시각과 패치 ID, 표본 수가 빠진다. 또한 OverFast는 원본 결측 `-1`을 `0`으로 바꾸므로, 이 API의 0%는 실제 0%와 결측을 구분하지 못한다. 직접 공식 원본을 사용할 경우 결측 표식을 보존하는 것이 유리하다.

현재 초기 메타의 승률 선형 환산 점수, S/A/B/C 기준, 상성 5개 및 시너지 8개의 수동 가중치는 **검증된 예측 모델이 아니다**. 능력 기반 설명용 초안이다. 승률만 높은 희귀 영웅, 숙련자 편향, 상대 조합, 패치 전환, 공수/맵 구간, 영웅 교체로 인한 선택 편향을 보정하지 못한다. 표본 수가 없으므로 신뢰구간을 산출할 수도 없다.

[Astra 공식 문서](https://developers.openai.com/api/docs/models/gpt-6-astra)는 연구·추론 용도를 지원하지만 오버워치 추천 정확도를 입증하지 않는다. [OpenAI 평가 지침](https://developers.openai.com/api/docs/guides/evaluation-best-practices)에 맞게 별도 실제 사례와 사람의 판단으로 평가해야 한다. 이번 작업은 출처·구조 확인이며 별도 Astra API 실험이나 정확도 벤치마크는 실행하지 않았다.

## 보완 출처

| 출처 | 실제 제공 내용 | 이 프로젝트에서의 역할 | API 및 주의점 |
|---|---|---|---|
| [Blizzard 공식](https://overwatch.blizzard.com/ko-kr/rates/) + [OverFast](https://overfast-api.tekrop.fr/docs) | 영웅·전장·능력·역할 고정 승률/픽률/밴률 | 수치 기준선 및 공식 패치 대조 | OverFast 공개 REST API 있음. 비공식 중계·캐시이며 쌍별 상성 없음 |
| [Counterwatch](https://www.counterwatch.gg/stats/overwatch) | 실제 이용자 경기의 영웅/맵 성과, 상대 상성, 듀오, 팀 분석 | 상성·시너지 보완 우선 후보 | 공개 사이트는 확인. 지원을 약속한 공개 개발자 API 문서는 확인하지 못함. 완성된 웹 서비스가 있다는 것과 외부 앱용 API가 있다는 것은 다름 |
| [OWTICS](https://owtics.gg/en-US) | 영웅·맵·티어별 메타 지표, 픽/밴, 추세, e스포츠 | 메타 추세와 맵 분석 교차 확인 | 공식 자료를 재가공한 화면은 독립된 추가 표본이 아님. Korea 버튼의 모집단 정의와 외부용 API는 추가 확인 필요 |
| [OW Tracker](https://owtracker.org/en/meta) | 커뮤니티 투표 티어, 영웅 설명/카운터 화면 | 정성 의견의 보조 근거 | 투표는 실전 승률과 다름. 검토 당시 총 733표로 표시. 표본·편향 제한을 표시해야 함 |

Counterwatch의 [방법론](https://www.counterwatch.gg/methodology)은 옵트인 이용자의 경기와 처치 기록을 사용한다고 설명한다. 작은 승률 표본은 50% 방향으로 보정하며, 상성은 결투·팀 교전 지표로 구성한다. 방어 매트릭스 같은 피해 억제 관계는 덜 포착될 수 있다. 모집단 전체나 한국 경쟁전 대표 표본으로 간주할 수 없다. 일부 소개 페이지가 “상성 승률”이라고 표현하지만, 최신 방법론과 상세 페이지는 상성 **지수**라고 명시한다.

[아나 상세 페이지](https://www.counterwatch.gg/stats/overwatch/heroes/ana)에서 표본 수, 상성 지수, 듀오 승률의 실제 표시를 확인했다. 상성 카드는 모든 게임 유형을 합친 자료라고 명시하며, 맵별 상성 분해는 없다고 안내한다. 그러므로 페이지 상단의 일반 경쟁전 필터만 보고 상성까지 동일 범위라고 가정하면 안 된다. [Press 페이지](https://www.counterwatch.gg/press)는 맞춤 데이터 요청 연락처를 제공하지만, 이번 조사에서 운영자에게 연락하거나 데이터 이용 승인을 요청하지는 않았다.

## 적용 방향

1. Codex에서 공식 수치·패치·커뮤니티 상성 근거를 검토한다. 지역·티어·모드·패치·조회 시각을 함께 보존한다.
2. 원본 관측치, 제3자 통계 지수, Astra의 능력 기반 해석을 별도 유형으로 관리한다. 중복 원천을 독립된 증거로 세지 않는다.
3. 모르는 상성은 미확인 상태로 둔다. 근거가 없어서 점수에 반영하지 않는 것과 실제 중립 상성은 다르다.
4. 추천 점수는 정렬용 점수로만 표시한다. 별도 검증 전에는 승리 확률이나 정확도라고 표시하지 않는다.
5. 충분히 검토한 메타 JSON만 프로젝트/앱에 적용한다. 경기 중 Gemini는 이 JSON과 사용자 입력을 이용해 추천·설명만 한다. 앱 내부 메타 조사나 웹 검색은 하지 않는다.
6. 실제 추천 사례를 따로 확보해 역할/맵/티어별 추천 타당성을 평가하고, 이후 실제 경기 기록으로 보정한다. 초기 데이터 생성만으로 “충분한 정확도 검증 완료”라고 판정하지 않는다.
