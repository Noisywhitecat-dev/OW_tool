import { useState } from 'react';
import type { Statistics } from '../shared/statistics';
import { STATISTICS_LIMITATIONS } from '../shared/statistics';
import { excludedMapDescription } from '../shared/mapAvailability';

export function StatisticsPanel({ data }: { data: Statistics }) {
  const [mapId, setMapId] = useState('');
  const source = data.byMap.find(m => m.mapId === mapId) ?? data.overall;
  const percentage = (value: number | null | undefined) => value == null ? '자료 없음' : value === 0 ? '0% · 결측 가능' : `${value.toFixed(2)}%`;
  return <section className="settings-card"><h2>메타에 포함된 공개 통계</h2>
    <p>아시아 대체 통계 · PC 역할 고정 경쟁전 · 요청 티어 {data.requestedRank} / 실제 범위 {data.actualRank === 'grandmaster' ? 'GM + 챔피언' : data.actualRank}</p>
    <p className="hint">Codex에서 검토한 원본 통계입니다. 앱이 자동으로 갱신하거나 수치를 변경하지 않습니다.</p>
    {data.unavailableMaps.length > 0 && <details><summary>통계에서 제외된 전장과 확인된 이유</summary>{data.unavailableMaps.map(m => <p className="hint" key={m.mapId}>{data.maps.data.find(x => x.key === m.mapId)?.name ?? m.mapId}: {excludedMapDescription(m.mapId)}</p>)}</details>}
    <label htmlFor="statistics-map">통계 전장 범위</label><select id="statistics-map" value={mapId} onChange={e => setMapId(e.target.value)}><option value="">전체 전장</option>{data.byMap.map(m => <option key={m.mapId} value={m.mapId}>{data.maps.data.find(x => x.key === m.mapId)?.name ?? m.mapId}</option>)}</select>
    <p className="hint">조회: {new Date(source.fetchedAt).toLocaleString('ko-KR')} · 정확한 집계 시각·패치 ID 미제공{source.upstreamCacheStatus === 'stale' ? ' · 원천 서버의 갱신 전 캐시' : ''}</p>
    <div style={{ overflowX: 'auto', maxHeight: 400 }}><table style={{ width: '100%', textAlign: 'left', borderSpacing: '12px 8px' }}><thead><tr><th>영웅</th><th>승률</th><th>픽률</th><th>밴률</th></tr></thead><tbody>{source.data.map(row => <tr key={row.hero}><td>{data.heroes.data.find(h => h.key === row.hero)?.name ?? row.hero}</td><td>{percentage(row.winrate)}</td><td>{percentage(row.pickrate)}</td><td>{percentage(row.banrate)}</td></tr>)}</tbody></table>{source.data.length === 0 && <p>이 범위에는 통계가 없습니다.</p>}</div>
    {STATISTICS_LIMITATIONS.map(text => <p className="hint" key={text}>· {text}</p>)}
    <a href={source.url} target="_blank" rel="noreferrer">OverFast 원본 응답 확인</a>
  </section>;
}
