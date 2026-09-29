// Reviewed against Blizzard's rates map filter and patch notes on 2026-09-29.
// An API rejection alone never proves that a map is absent from live matchmaking.
export const MAP_REVIEW_DATE = '2026-09-29';
const stadiumOnly = new Set(['arena-victoriae', 'gogadoro', 'place-lacroix', 'redwood-dam', 'wuxing-university']);
const removedClash = new Set(['hanaoka', 'throne-of-anubis']);
export function excludedMapDescription(id: string) {
  if (stadiumOnly.has(id)) return `스타디움 전용 · 일반 역할 고정 경쟁전 대상 아님 (${MAP_REVIEW_DATE} 확인)`;
  if (removedClash.has(id)) return `일반 경쟁전에서 제거된 격돌 전장 · 스타디움 버전은 별도 (${MAP_REVIEW_DATE} 확인)`;
  return 'API 통계 미지원 · 실제 경쟁전 등장 여부 미확인';
}
