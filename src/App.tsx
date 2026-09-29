import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Crosshair, ExternalLink, HeartPulse, LoaderCircle, Search, Settings2, Shield, Undo2, X } from 'lucide-react';
import { roleNames, roles, slots, type Candidate, type RecommendationInput, type RecommendationResult, type Role, type Settings, type Snapshot } from '../shared/schema';
import { rankLocally } from '../shared/ranking';
import { SettingsPanel } from './SettingsPanel';
import { blankTeam, initialInput, matchesHero, nextEmpty, positions, reconcileInput, type Position } from './quickInput';

type AppState = { snapshot: Snapshot; settings: Settings; keyAvailable: boolean; keysAvailable: { gemini: boolean; openai: boolean } };
const roleIcons = { tank: Shield, damage: Crosshair, support: HeartPulse };
const teamNames = { allies: '우리 팀', enemies: '상대 팀' };
function RoleIcon({ role }: { role: Role }) { const Icon = roleIcons[role]; return <Icon size={16} />; }
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OW-Tool': '1' }, body: JSON.stringify(body) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('앱 서버에 연결할 수 없습니다.');
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '요청에 실패했습니다.'); return data as T;
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<'recommend' | 'settings'>('recommend');
  const [input, setInput] = useState<RecommendationInput>(initialInput('kings-row'));
  const [active, setActive] = useState<Position>({ team: 'allies', index: 1 });
  const [query, setQuery] = useState(''), [highlight, setHighlight] = useState(0);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [undoInput, setUndoInput] = useState<RecommendationInput | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const highlightedRef = useRef<HTMLButtonElement>(null);
  const fingerprint = JSON.stringify([state?.snapshot.id, state?.settings, input]);
  const current = useRef(fingerprint); current.current = fingerprint;
  const load = async () => {
    const data = await api<AppState>('/api/state');
    setState(data); setInput(previous => reconcileInput(previous, data.snapshot)); setResult(null); setUndoInput(null);
  };
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  useEffect(() => { setResult(null); }, [fingerprint]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key === 'F2' && tab === 'recommend') { event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      if (event.key === 'Escape' && tab === 'settings') setTab('recommend');
    };
    window.addEventListener('keydown', focusSearch); return () => window.removeEventListener('keydown', focusSearch);
  }, [tab]);
  const candidates = useMemo(() => state ? rankLocally(state.snapshot, input).slice(0, 5) : [], [state, input]);
  const role = slots[active.index];
  const heroes = useMemo(() => state?.snapshot.heroes.filter(h => h.role === role && matchesHero(h, query)) ?? [], [state?.snapshot, role, query]);
  const available = heroes.filter(h => !input[active.team].some((id, index) => id === h.id && index !== active.index));
  const highlighted = available[Math.min(highlight, Math.max(0, available.length - 1))]?.id;
  useEffect(() => { highlightedRef.current?.scrollIntoView({ block: 'nearest' }); }, [highlighted]);
  const focus = () => { requestAnimationFrame(() => searchRef.current?.focus()); };
  const change = (value: RecommendationInput) => { if (JSON.stringify(value) !== JSON.stringify(input)) { setUndoInput(input); setInput(value); } };
  const activate = (position: Position) => { setActive(position); setQuery(''); setHighlight(0); focus(); };
  const select = (heroId: string | null) => {
    const wasEmpty = !input[active.team][active.index];
    const value = { ...input, [active.team]: input[active.team].map((id, index) => index === active.index ? heroId : id) };
    change(value); setQuery(''); setHighlight(0);
    // During a swap, keep this slot active. Only first-time entry advances.
    if (heroId && wasEmpty) { const next = nextEmpty(value, active); if (next) setActive(next); }
    focus();
  };
  const changeRole = (role: Role) => {
    const ownSlot = slots.indexOf(role), allies = [...input.allies]; allies[ownSlot] = null;
    const value = { ...input, role, ownSlot, allies }; change(value);
    if (active.team === 'allies' && active.index === ownSlot) activate(nextEmpty(value, active) ?? positions(value)[0]);
  };
  const undo = () => {
    if (!undoInput) return;
    setInput(undoInput); setUndoInput(null);
    if (active.team === 'allies' && active.index === undoInput.ownSlot) activate(positions(undoInput)[0]);
    setQuery(''); setHighlight(0);
  };
  const recommend = async () => {
    if (busy) return;
    const captured = fingerprint; setBusy(true); setError('');
    try { const value = await api<RecommendationResult>('/api/recommend', input); if (captured === current.current) setResult(value); }
    catch (e) { if (captured === current.current) setError((e as Error).message); }
    finally { setBusy(false); }
  };
  if (!state) return <main className="loading"><h1>OW Compass</h1><p>{error || '불러오는 중…'}</p>{error && <button className="secondary" onClick={() => void load().catch(e => setError(e.message))}>다시 연결</button>}</main>;
  const { snapshot } = state;
  const selected = input.allies.filter(Boolean).length + input.enemies.filter(Boolean).length;
  const display = result?.candidates ?? candidates;
  const stale = Date.now() - Date.parse(snapshot.createdAt) > 14 * 86400000;

  return <div className="app-shell">
    <header className="app-header"><button className="brand" onClick={() => setTab('recommend')}><Crosshair size={20} /><h1>OW Compass</h1></button><span className="meta-status">{snapshot.kind === 'demo' ? '예시 메타' : `메타 ${snapshot.patchDate}`}{stale && ' · 갱신 확인'}</span><button className={`settings-toggle ${tab === 'settings' ? 'selected' : ''}`} onClick={() => setTab(tab === 'settings' ? 'recommend' : 'settings')}><Settings2 size={16} />{tab === 'settings' ? '경기로 돌아가기' : '메타 · 설정'}</button></header>
    {error && <div className="error" role="alert">{error}<button aria-label="오류 닫기" onClick={() => setError('')}><X size={16} /></button></div>}
    {tab === 'settings' ? <main className="settings-scroll"><SettingsPanel state={state} onRefresh={load} onError={setError} /></main> : <main className="match-screen">
      <section className="match-controls" aria-label="경기 설정">
        <label className="map-choice">전장<select aria-label="전장" value={input.mapId} onChange={e => change({ ...input, mapId: e.target.value })}>{snapshot.maps.map(m => <option key={m.id} value={m.id}>{m.name} · {m.mode}</option>)}</select></label>
        <div className="control-group"><span>내 역할</span><div className="segmented">{roles.map(role => <button key={role} aria-pressed={input.role === role} className={input.role === role ? 'selected' : ''} onClick={() => changeRole(role)}><RoleIcon role={role} />{roleNames[role]}</button>)}</div></div>
        <div className="control-group side-controls"><span>진영 <small>AI 정렬에 반영</small></span><div className="segmented">{([['either', '전체'], ['attack', '공격'], ['defense', '수비']] as const).map(([side, label]) => <button key={side} aria-pressed={input.side === side} className={input.side === side ? 'selected' : ''} onClick={() => change({ ...input, side })}>{label}</button>)}</div></div>
        <button className="secondary new-match" onClick={() => { change({ ...input, side: 'either', allies: blankTeam(), enemies: blankTeam() }); activate(positions(input)[0]); }}>조합 초기화</button>
      </section>
      <div className="battle-layout">
        <section className="lineup-panel" aria-label="조합 입력">
          <div className="lineup-heading"><h2>조합 <span>{selected}/9</span></h2><button className="text-button" disabled={!undoInput} onClick={undo}><Undo2 size={14} />되돌리기</button></div>
          <div className="teams">{(['allies', 'enemies'] as const).map(team => <div className={`team-row ${team}`} key={team}><h3>{teamNames[team]}</h3><div className="team-slots">{slots.map((role, index) => {
            const hero = snapshot.heroes.find(h => h.id === input[team][index]), own = team === 'allies' && index === input.ownSlot;
            const isActive = active.team === team && active.index === index;
            return <button key={index} disabled={own} aria-pressed={!own && isActive} className={`team-slot ${own ? 'own' : ''} ${isActive && !own ? 'active' : ''} ${hero ? 'filled' : ''}`} aria-label={`${teamNames[team]} ${roleNames[role]} ${index + 1} ${own ? '내 자리' : hero?.name ?? '선택'}`} onClick={() => activate({ team, index })}><span><RoleIcon role={role} />{roleNames[role]}</span><strong>{own ? '내 자리' : hero?.name ?? '+'}</strong></button>;
          })}</div></div>)}</div>
          <section className={`hero-picker ${active.team}`} aria-label="영웅 선택">
            <div className="picker-heading"><h2>{teamNames[active.team]} <span>{roleNames[role]} {active.index === 2 || active.index === 4 ? '2' : '1'}</span></h2><span>{input[active.team][active.index] ? '영웅 교체' : '영웅 선택'}</span></div>
            <div className="search-row"><div className="search-field"><Search size={16} /><input ref={searchRef} aria-label="영웅 검색" autoComplete="off" placeholder="이름 / 초성 검색" value={query} onChange={e => { setQuery(e.target.value); setHighlight(0); }} onKeyDown={e => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === 'Enter' && highlighted) { e.preventDefault(); select(highlighted); }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHighlight(value => available.length ? (Math.min(value, available.length - 1) + (e.key === 'ArrowDown' ? 1 : -1) + available.length) % available.length : 0); }
              if (e.key === 'Escape') { setQuery(''); setHighlight(0); e.currentTarget.blur(); }
            }} /><kbd>F2</kbd></div><button className="secondary clear-slot" disabled={!input[active.team][active.index]} onClick={() => select(null)}>비우기</button></div>
            <div className="hero-grid">{heroes.map(hero => {
              const disabled = input[active.team].some((id, index) => id === hero.id && index !== active.index);
              return <button key={hero.id} ref={hero.id === highlighted ? highlightedRef : null} disabled={disabled} title={disabled ? '이미 선택한 영웅' : undefined} className={`${hero.id === highlighted ? 'highlighted' : ''} ${hero.id === input[active.team][active.index] ? 'picked' : ''}`} aria-label={`${hero.name} 선택`} onClick={() => select(hero.id)}>{hero.name}{hero.id === highlighted && <span aria-hidden="true">↵</span>}</button>;
            })}{!heroes.length && <p className="empty">검색 결과 없음</p>}</div>
            <div className="input-help"><span><kbd>↑</kbd><kbd>↓</kbd> 이동 <kbd>Enter</kbd> 선택</span><span role="status">{selected === 9 ? '9명 입력 완료' : '확인한 영웅만 입력'}</span></div>
          </section>
        </section>
        <section className="results-panel" aria-label="추천 결과"><div className="results-heading"><div><h2>{roleNames[input.role]} 추천</h2><span>{result?.mode === 'gpt' ? `AI 정렬${result.cached ? ' · 캐시' : ''}` : '입력 즉시 계산'}</span></div><button className="primary" disabled={busy || !state.keyAvailable || snapshot.kind === 'demo'} title={!state.keyAvailable ? '메타 · 설정에서 API 키를 저장하세요' : '저장된 메타로 추천 순위 재정렬'} onClick={() => void recommend()}>{busy && <LoaderCircle size={15} className="spin" />}{busy ? '정렬 중' : 'AI 정렬'}</button></div>
          {!state.keyAvailable && <p className="key-note">AI 키 미설정 · 로컬 추천 사용 중</p>}
          {result?.warning && <p className="inline-warning" role="status">{result.warning}</p>}
          <div className="recommendations">{display.map((candidate, index) => <RecommendationCard key={`${fingerprint}:${candidate.hero.id}`} candidate={candidate} index={index} snapshot={snapshot} />)}</div>
          <details className="scoring-note"><summary>점수 기준 · 데이터 한계</summary><p>비교 점수이며 승률이 아닙니다. 메타 30% · 맵 25% · 상대 25% · 아군 20%. 미확인 상성은 중립 처리합니다. 진영은 AI 정렬에만 반영됩니다. AI 순위와 로컬 점수 순서는 다를 수 있습니다.</p>{snapshot.limitations.map(text => <p key={text}>{text}</p>)}</details>
        </section>
      </div>
    </main>}
  </div>;
}

function RecommendationCard({ candidate: c, index, snapshot }: { candidate: Candidate; index: number; snapshot: Snapshot }) {
  return <details className={`recommendation-card ${index === 0 ? 'best' : ''}`}><summary aria-label={`${index + 1}위 ${c.hero.name} 추천 근거`}><span className="rank-number">{index + 1}</span><div className="hero-description"><h3>{c.hero.name}</h3><span>{index === 0 ? '우선 추천' : roleNames[c.hero.role]}</span></div><div className="score"><strong>{c.score.toFixed(1)}</strong><small>점수</small></div><ChevronDown size={15} /></summary><div className="evidence"><div className="metric-grid">{([['meta', '메타'], ['map', '맵'], ['counter', '상대'], ['synergy', '아군']] as const).map(([key, label]) => <div key={key}>{label}<b>{Math.round(c.breakdown[key])}</b></div>)}</div><ul>{c.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul><p>{c.caution}</p><div className="sources">{snapshot.sources.filter(s => c.sourceIds.includes(s.id)).map(s => <a href={s.url} key={s.id} target="_blank" rel="noreferrer">{s.title}<ExternalLink size={12} /></a>)}</div></div></details>;
}
