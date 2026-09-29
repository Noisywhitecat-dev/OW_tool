import { useState } from 'react';
import type { Settings, Snapshot } from '../shared/schema';
import { DesktopKeySettings } from './DesktopKeySettings';
import { StatisticsPanel } from './StatisticsPanel';
type State = { snapshot: Snapshot; settings: Settings; keysAvailable: { gemini: boolean; openai: boolean } };
export function SettingsPanel({ state, onRefresh, onError }: { state: State; onRefresh: () => Promise<void>; onError: (message: string) => void }) {
  const [draft, setDraft] = useState(state.settings), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const mutate = async (url: string, value: unknown, method: string) => {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-OW-Tool': '1' }, body: JSON.stringify(value) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  };
  const save = async () => {
    setBusy(true); onError('');
    try { await mutate('/api/settings', draft, 'PUT'); await onRefresh(); setSaved(true); }
    catch (error) { onError((error as Error).message); } finally { setBusy(false); }
  };
  const importMeta = async (file: File | undefined) => {
    if (!file) return; setBusy(true); onError('');
    try { if (file.size > 8 * 1024 * 1024) throw new Error('8MB 이하의 메타 JSON 파일을 선택해 주세요.'); await mutate('/api/meta/import', JSON.parse(await file.text()), 'POST'); await onRefresh(); }
    catch (error) { onError((error as Error).message); } finally { setBusy(false); }
  };
  return <div className="settings-page"><div className="page-heading"><h1>메타 · 설정</h1></div>
    <div className="settings-grid"><section className="settings-card"><h2>적용 중인 메타</h2><dl><dt>패치 / 자료 기준</dt><dd>{state.snapshot.patch}</dd><dt>적용 티어</dt><dd>{state.snapshot.scope.rank}</dd><dt>영웅 / 맵</dt><dd>{state.snapshot.heroes.length}명 / {state.snapshot.maps.length}개</dd><dt>자료 작성</dt><dd>{new Date(state.snapshot.createdAt).toLocaleString('ko-KR')}</dd><dt>출처</dt><dd>{state.snapshot.sources.length}개</dd></dl><p>{state.snapshot.summary}</p>
      <details><summary>데이터 한계</summary>{state.snapshot.limitations.map(text => <p className="hint" key={text}>· {text}</p>)}</details>
      <label htmlFor="meta-file">Codex에서 검토한 메타 파일 적용</label><input id="meta-file" type="file" accept=".json,application/json" disabled={busy} onChange={e => { void importMeta(e.target.files?.[0]); e.target.value = ''; }} />
      <p className="hint">Codex에서 검토한 JSON을 적용합니다. 검증에 실패하면 기존 자료를 유지합니다.</p>
    </section><div><section className="settings-card"><h2>경기 중 AI 추천</h2><fieldset disabled={busy}>
      <label htmlFor="provider">AI 제공자</label><select id="provider" value={draft.provider} onChange={e => { const provider = e.target.value as Settings['provider']; setDraft({ ...draft, provider, rankingModel: provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-6-astra' }); setSaved(false); }}><option value="gemini">Gemini · 무료 티어 지원 모델</option><option value="openai">OpenAI · 별도 API 과금</option></select>
      <p className="hint">{draft.provider === 'gemini' ? 'Gemini 2.5 Flash는 무료 티어를 지원합니다. 실제 요금과 한도는 Google 프로젝트 등급에 따릅니다. 무료 티어 데이터는 Google 제품 개선에 사용될 수 있습니다.' : 'OpenAI API는 ChatGPT 구독과 별도 과금됩니다.'} 웹 검색 없이 추천당 최대 1회 요청합니다. 자동 재시도나 제공자 자동 전환은 없습니다.</p>
      <label htmlFor="ranking-model">추천 모델</label><input id="ranking-model" value={draft.rankingModel} readOnly={draft.provider === 'gemini'} onChange={e => { setDraft({ ...draft, rankingModel: e.target.value }); setSaved(false); }} />
      <label htmlFor="effort">추론 노력</label><select id="effort" value={draft.rankingEffort} onChange={e => { setDraft({ ...draft, rankingEffort: e.target.value as 'low' | 'medium' }); setSaved(false); }}><option value="low">Low · 빠른 추천</option><option value="medium">Medium · 조합 비교</option></select>
      <button className="primary" onClick={() => void save()}>{saved ? '저장됨' : '추천 설정 저장'}</button>
      <p className="hint">동일한 메타·맵·조합·모델은 30분간 재사용합니다. 키가 없거나 한도를 초과하면 로컬 점수로 추천합니다.</p>
    </fieldset></section><section className="settings-card"><h2>API 키</h2><p>{state.keysAvailable[draft.provider] ? '선택한 제공자의 키가 설정되어 있습니다.' : '선택한 제공자의 키가 필요합니다.'}</p>
      {window.owDesktop ? <DesktopKeySettings key={draft.provider} provider={draft.provider} disabled={busy} onSaved={onRefresh} /> : <p className="hint">데스크톱 앱에서는 여기서 키를 입력할 수 있습니다. 개발용 브라우저 실행은 서버 환경변수 {draft.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'}를 사용합니다.</p>}
      <a href={draft.provider === 'gemini' ? 'https://aistudio.google.com/api-keys' : 'https://platform.openai.com/api-keys'} target="_blank" rel="noreferrer">API 키 관리</a>
    </section></div></div>
    {state.snapshot.statistics && <details className="settings-disclosure"><summary>원본 통계 · 제외 전장</summary><StatisticsPanel data={state.snapshot.statistics} /></details>}
    {state.snapshot.sources.length > 0 && <details className="settings-disclosure"><summary>메타 출처</summary><div className="settings-card sources">{state.snapshot.sources.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div></details>}
  </div>;
}
