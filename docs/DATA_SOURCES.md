# 데이터 원천 조사

확인일: 2026-09-29 (한국 시간). 사용자가 지정한 주 환경은 **PC 5대5 경쟁전, KR의 넥슨 서버**이다. 서버/서비스 명칭은 사용자 표현을 기록한 것이며, 공식 서비스 구분과 API 필터의 대응은 후속 확인이 필요하다. 아시아 전체를 한국 전용 통계로 표기하지 않는다.

## 결론

OverFast를 공개 통계와 기본 목록의 우선 연동 후보로 선정한다. 공개 문서와 실제 요청을 통해 한국어 영웅 목록, PC·아시아·다이아몬드 경쟁전 통계, 왕의 길별 통계의 HTTP 200 응답을 확인했다. **앱에 자동 수집 기능을 연결하는 작업은 아직 시작하지 않았다.** 현재 앱은 예시 데이터와 OpenAI 조사/추천 어댑터를 제공한다.

| 원천 | 확인된 출처와 제공 데이터 | 적용 판단 |
| --- | --- | --- |
| OW ATHENA | 개발자 노트가 승률·픽률·금지율을 Blizzard 공식 데이터로 명시. 메타점수·지형 적합도·종합점수는 자체 계산 | 원시 통계는 같은 상위 원천을 사용하는 공개 API 우선. 자체 계산값은 앱으로 복제하지 않음 |
| OWTICS.GG | 지역·티어·맵별 통계와 자체 메타 지수 제공. 확인한 공개 홈·기여자·더보기·약관에서는 직접적인 수집 원천이나 공개 API 문서를 찾지 못함 | 링크를 통한 보조 참고 가능. 원천이 Blizzard라고 단정하지 않음. 대량 재배포 허용도 확인되지 않음 |
| OverFast API | 공개 REST API. Blizzard 영웅 페이지와 공개 통계 페이지의 데이터를 정규화. 역할 고정 경쟁전, 지역·티어·맵 필터 제공 | 실제 응답 확인 완료. API 어댑터와 파일 캐시를 후속 구현 |

## OW ATHENA

[개발자 노트](https://www.ow-athena.com/dev-notes)에 따르면 승률/픽률/금지율은 Blizzard 공식 데이터이고, 보정 픽률은 금지율을 고려한다. 메타점수는 보정 픽률과 승률의 신뢰 정도를 이용하며, 적합도는 영웅과 전장의 교전 거리·지형 일치도를 이용한다. 우리 앱의 초기 가중치 점수와 동일한 지표가 아니다.

[robots.txt](https://www.ow-athena.com/robots.txt)는 일반 페이지를 허용하지만 `/api/`와 `/data/`를 제외한다. 내부 API를 앱의 수집 경로로 채택하지 않는다. 공개 API 계약이나 데이터 재사용 라이선스는 확인하지 못했다. 별도 사이트인 `Turbotailz/athena-api`와의 관계도 확인되지 않았으므로 같은 서비스로 취급하지 않는다.

## OWTICS.GG

[홈](https://owtics.gg/ko-KR), [기여자](https://owtics.gg/ko-KR/contributors), [더보기](https://owtics.gg/ko-KR/more), [이용약관](https://owtics.gg/ko-KR/terms)을 확인했다. 약관은 서비스 비방해와 데이터 정확성 비보장 등을 명시하지만, 통계의 대량 복제·재배포를 허가하는 명시적 문구는 찾지 못했다. 이는 전면 금지라는 뜻이 아니라 확인되지 않았다는 뜻이다.

[robots.txt](https://owtics.gg/robots.txt)는 사용자 요청에 따라 출처를 연결하는 검색/어시스턴트 접근을 환영한다고 설명하며 일부 학습·대량 색인 봇은 거부한다. 읽기 허용과 데이터 재배포 라이선스는 구분한다. 현 단계에서는 사용자의 요청에 따른 소량 읽기와 링크 참고만 수행했다. 사이트 운영자에게 연락을 보내지 않았다.

## OverFast

- [API 문서](https://overfast-api.tekrop.fr/), [OpenAPI 명세](https://overfast-api.tekrop.fr/openapi.json)
- [공개 프로젝트](https://github.com/TeKrop/overfast-api)
- [Blizzard 원천 경로 설정](https://github.com/TeKrop/overfast-api/blob/main/app/config.py)
- [통계 파서](https://github.com/TeKrop/overfast-api/blob/main/app/domain/parsers/hero_stats_summary.py)
- [MIT 소프트웨어 라이선스](https://github.com/TeKrop/overfast-api/blob/main/LICENSE)

공개 소스의 설정과 파서에서 원천이 `https://overwatch.blizzard.com/en-us/rates/data/`임을 확인했다. 이는 일반 개발자용 공식 API 계약이 존재한다는 뜻은 아니다. Blizzard 공개 웹 통계용 경로를 비공식 API가 감싸는 구조다. 프로젝트 코드의 MIT 라이선스를 게임 데이터·이미지의 권리까지 허가하는 것으로 해석하지 않는다.

실제 확인한 요청:

```text
GET /heroes?locale=ko-kr
GET /maps
GET /heroes/stats?platform=pc&gamemode=competitive&region=asia&competitive_division=diamond
GET /heroes/stats?platform=pc&gamemode=competitive&region=asia&map=kings-row&competitive_division=diamond
```

핵심 응답은 `hero`, `pickrate`, `winrate`, `banrate`다. 명세상 영웅/맵 캐시는 24시간, 통계 캐시는 1시간이며 제한은 변경될 수 있다. 맵별 통계 요청에서도 `Cache-Control: public, max-age=3600`을 확인했다. 조회 시각과 집계 기준 시각을 같은 것으로 표시하면 안 된다.

### 구현 전 반드시 반영할 차이

1. 지역은 `asia`, `americas`, `europe`만 지원한다. KR 또는 넥슨 전용 필터는 없다. 한국 전용 통계를 확보할 수 없으면 UI에 **아시아 대체 통계**라고 표시한다.
2. 티어는 bronze/silver/gold/platinum/**emerald**/diamond/master/grandmaster다. `grandmaster`에는 champion이 합쳐진다. 현재 앱의 선택지에 에메랄드를 추가하고 GM/챔피언 자료 범위를 명확히 할 필요가 있다.
3. `/maps`는 경쟁전 이외의 전장도 포함한다. 경쟁전 지원 모드와 해당 패치의 실제 전장 가용성을 구분한다. 목록에 있다는 이유만으로 현 시즌 경쟁전 전장이라고 단정하지 않는다.
4. 영웅 목록의 `gamemodes`에는 quickplay/stadium 구분이 있다. 경쟁전 통계의 영웅 ID와 교차 확인한다.
5. 공개 파서는 Blizzard의 결측값 `-1`을 `0.0`으로 변환한다. 0%를 실제 승률·확실한 최하위 영웅으로 처리하지 말고 결측 가능성을 남긴다.
6. 이 통계 응답에는 표본 수, 정확한 집계 기간, 패치 ID, 영웅 쌍별 카운터/시너지 행렬이 없다. 없는 값을 만들지 않는다.
7. 밴률을 제공한다. 향후 실제 밴 영웅 입력을 추가할 때 추천 후보에서 제외하는 기능으로 확장할 수 있다.

## 후속 연동 설계

메타 갱신 버튼 → 공개 API에서 영웅/맵/티어·맵별 통계 수집 → 검증하고 원본과 출처/조회 시각/범위를 보존 → GPT high에 근거로 전달 → 공식 패치와 공략을 교차 검증 → 메타 스냅샷 저장 순서로 연결한다.

요청 속도를 제한하고 HTTP 429/503과 `Retry-After`를 처리한다. 서버 파일 캐시를 사용하며 경기 중 추천 버튼에서는 외부 통계 API를 호출하지 않는다. API 장애나 범위 불일치 시 기존 정상 메타를 유지한다. API 수치를 GPT가 수정한 사실로 저장하지 않도록 원본 통계와 해석을 분리한다.
