import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, Compass, Crosshair, Database, ExternalLink, HeartPulse, Info, LoaderCircle, MapPin, RefreshCw, Search, Settings2, Shield, Sparkles, Swords, X } from 'lucide-react';
import { roleNames, roles, slots, type Candidate, type Hero, type Job, type RecommendationInput, type RecommendationResult, type Role, type Settings, type Snapshot } from '../shared/schema';
import { rankLocally } from '../shared/ranking';
import { SettingsPanel } from './SettingsPanel';

type AppState = { snapshot: Snapshot; settings: Settings; keyAvailable: boolean; keysAvailable: { gemini: boolean; openai: boolean }; };
const ranks: Record<Snapshot['scope']['rank'], string> = { all: '전체 티어', bronze: '브론즈', silver: '실버', gold: '골드', platinum: '플래티넘', emerald: '에메랄드', diamond: '다이아몬드', master: '마스터', grandmaster: '그랜드마스터', champion: '챔피언' };
const roleIcons = { tank: Shield, damage: Crosshair, support: HeartPulse };
const blankTeam = () => [null, null, null, null, null] as (string | null)[];
const initialInput = (mapId: string): RecommendationInput => ({ mapId, role: 'tank', side: 'either', ownSlot: 0, allies: blankTeam(), enemies: blankTeam() });
async function api<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json', 'X-OW-Tool': '1' }, body: JSON.stringify(body) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('서버에 연결할 수 없습니다. 앱 서버가 실행 중인지 확인해 주세요.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data as T;
}
function RoleIcon({ role, size = 18 }: { role: Role; size?: number }) { const Icon = roleIcons[role]; return <Icon size={size} />; }
function HeroMark({ hero, small = false }: { hero: Hero; small?: boolean }) { return <span className={`hero-mark ${hero.role} ${small ? 'small' : ''}`}><RoleIcon role={hero.role} size={small ? 15 : 24} /></span>; }

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<'recommend' | 'settings'>('recommend');
  const [input, setInput] = useState<RecommendationInput>(initialInput('kings-row'));
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<{ team: 'allies' | 'enemies'; index: number } | null>(null);
  const fingerprint = JSON.stringify([state?.snapshot.id, input]);
  const current = useRef(fingerprint); current.current = fingerprint;
  const load = async () => {
    const data = await api<AppState>('/api/state');
    setState(data); setInput(initialInput(data.snapshot.maps[0].id)); setResult(null);
  };
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  useEffect(() => { setResult(null); }, [fingerprint]);
  const candidates = useMemo(() => state ? rankLocally(state.snapshot, input).slice(0, 5) : [], [state, input]);
  const mapRanks = useMemo(() => state ? roles.map(role => ({ role, candidates: rankLocally(state.snapshot, { ...initialInput(input.mapId), role, ownSlot: slots.indexOf(role) }).slice(0, 5) })) : [], [state?.snapshot, input.mapId]);
  const recommend = async () => {
    const captured = fingerprint; setBusy(true); setError('');
    try { const value = await api<RecommendationResult>('/api/recommend', input); if (captured === current.current) setResult(value); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  if (!state) return <main className="loading"><Compass size={42} /><h1>OW COMPASS</h1><p>{error || '픽 가이드를 준비하고 있습니다…'}</p>{error && <button onClick={() => { setError(''); void load().catch(e => setError(e.message)); }}>다시 연결</button>}</main>;
  const { snapshot, settings } = state;
  const map = snapshot.maps.find(m => m.id === input.mapId)!;
  const isDemo = snapshot.kind === 'demo';
  const selected = input.allies.filter(Boolean).length + input.enemies.filter(Boolean).length;
  const display = result?.candidates ?? candidates;
  const age = Date.now() - Date.parse(snapshot.createdAt);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('recommend'); }}><span className="brand-icon"><Compass size={25} /></span><span>OW <b>COMPASS</b><small>YOUR NEXT PICK.</small></span></a>
      <p className="nav-label">PLAYBOOK</p>
      <nav aria-label="주 메뉴">
        <button className={tab === 'recommend' ? 'active' : ''} onClick={() => setTab('recommend')}><Crosshair size={19} /> 영웅 추천 <ChevronRight size={15} /></button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Database size={19} /> 메타 · 설정</button>
      </nav>
      <div className="sidebar-note"><span className="eyebrow">LESS GUESSING.<br />BETTER PICKS.</span><p>맵을 읽고, 조합을 맞추고.<br />다음 한타를 준비하세요.</p><div className="compass-art"><Compass size={126} strokeWidth={.55} /></div></div>
      <div className="sidebar-bottom"><span className={`status-dot ${isDemo ? 'demo' : ''}`} /><span>{isDemo ? '체험 모드' : '저장된 메타 사용 중'}<small>PC · 5대5 경쟁전</small></span><span className="version">v0.1</span></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div><span>플레이북</span><ChevronRight size={14} /><strong>{tab === 'recommend' ? '영웅 추천' : '메타 · 설정'}</strong></div><span className="top-status"><span className="status-dot" /> {isDemo ? '예시 데이터 연결됨' : `메타 기준 · ${snapshot.patchDate}`}</span></header>
      <main>
        <div className={`notice ${isDemo ? '' : 'live-notice'}`}><Info size={17} /><span>{isDemo ? '지금은 체험 모드입니다. 표시되는 티어와 점수는 예시이며 실제 시즌 메타가 아닙니다.' : `${snapshot.patch} · ${ranks[snapshot.scope.rank]} 기준 · ${new Date(snapshot.createdAt).toLocaleDateString('ko-KR')} 저장`}</span><button onClick={() => setTab('settings')}>{isDemo ? '메타 파일 적용' : '메타 관리'} <ArrowRight size={14} /></button></div>
        {!isDemo && age > 14 * 86400000 && <p className="inline-warning">저장된 메타가 14일 이상 지났습니다. 최근 밸런스 패치가 있었는지 확인해 주세요.</p>}
        {error && <div className="error" role="alert">{error}<button aria-label="오류 닫기" onClick={() => setError('')}><X size={16} /></button></div>}
        {tab === 'settings' ? <SettingsPanel state={state} onRefresh={load} onError={setError} /> : <>
          <div className="page-heading"><div><p className="eyebrow accent">A LITTLE INTEL. A BETTER GAME.</p><h1>다음 한타를 바꾸는 선택<span>.</span></h1><p>전장과 팀 조합에 맞는, 지금 가장 필요한 영웅을 찾아보세요.</p></div><span className="mode-tag"><Swords size={15} /> 경쟁전 · 역할 고정</span></div>
          <section className="map-section">
            <div className="section-title"><h2><span>01</span> 전장 선택</h2><span className="muted">{isDemo ? '체험용 ' : ''}{snapshot.maps.length}개 전장</span></div>
            <div className="map-layout">
              <div className={`map-visual map-${snapshot.maps.indexOf(map) % 3}`}><div className="map-grid" /><MapPin className="map-pin" size={45} strokeWidth={1} /><span className="map-coordinate">TACTICAL OVERVIEW / {String(snapshot.maps.indexOf(map) + 1).padStart(2, '0')}</span><div className="map-copy"><span className="mode-pill">{map.mode}</span><h3>{map.name}</h3><p>{map.description}</p><div>{map.tags.map(t => <span className="map-tag" key={t}>{t}</span>)}</div></div></div>
              <div className="map-controls"><label htmlFor="map-choice">이번 경기의 전장</label><select id="map-choice" value={input.mapId} onChange={e => setInput(i => ({ ...i, mapId: e.target.value }))}>{snapshot.maps.map(m => <option key={m.id} value={m.id}>{m.name} · {m.mode}</option>)}</select><label>진영</label><div className="segmented">{([['either', '전체'], ['attack', '공격'], ['defense', '수비']] as const).map(([side, label]) => <button key={side} className={input.side === side ? 'selected' : ''} aria-pressed={input.side === side} onClick={() => setInput(i => ({ ...i, side }))}>{label}</button>)}</div><p className="hint">맵 기본 추천은 즉시 계산됩니다.<br />공격·수비 상황은 AI 정렬 시 함께 고려합니다.</p></div>
            </div>
            <div className="map-hero-grid">{mapRanks.map(({ role, candidates }) => <div className="map-role" key={role}><div className={`map-role-heading ${role}`}><RoleIcon role={role} /><h3>{roleNames[role]} 추천</h3><span>TOP 5</span></div><div className="map-hero-list">{candidates.map((c, i) => <div key={c.hero.id}><span className="tiny-rank">{i + 1}</span><span>{c.hero.name}</span><span className={`tier tier-${c.hero.tier}`}>{c.hero.tier === 'unknown' ? '?' : c.hero.tier}</span></div>)}</div></div>)}</div>
          </section>
          <section className="composition-section">
            <div className="section-title"><h2><span>02</span> 내 역할과 팀 조합</h2><button className="text-button" onClick={() => setInput(i => ({ ...i, allies: blankTeam(), enemies: blankTeam() }))}><RefreshCw size={13} /> 조합 초기화</button></div>
            <div className="role-select"><span className="muted">내 포지션</span>{roles.map(role => <button key={role} aria-pressed={input.role === role} className={input.role === role ? 'selected' : ''} onClick={() => setInput(i => { const allies = [...i.allies]; const ownSlot = slots.indexOf(role); allies[ownSlot] = null; return { ...i, role, ownSlot, allies }; })}><RoleIcon role={role} />{roleNames[role]}{input.role === role && <Check size={14} />}</button>)}<small>내 자리는 추천 영웅을 위해 비워 둡니다.</small></div>
            <div className="teams-grid">{(['allies', 'enemies'] as const).map(team => <div className={`team-panel ${team}`} key={team}><div className="team-heading"><h3><span className="team-dot" />{team === 'allies' ? '우리 팀' : '상대 팀'}</h3><span>{team === 'allies' ? '함께 만드는 시너지' : '대응할 핵심 위협'}</span></div><div className="team-slots">{slots.map((role, index) => {
              const hero = snapshot.heroes.find(h => h.id === input[team][index]); const own = team === 'allies' && input.ownSlot === index;
              return <button key={index} className={`team-slot ${own ? 'own' : ''} ${hero ? 'filled' : ''}`} disabled={own} aria-label={`${team === 'allies' ? '우리 팀' : '상대 팀'} ${roleNames[role]} ${index + 1}${hero ? ` ${hero.name}` : ' 선택'}`} onClick={() => setPicker({ team, index })}><span className="slot-role">{roleNames[role]}</span>{own ? <Crosshair size={24} /> : hero ? <HeroMark hero={hero} /> : <span className="slot-plus">+</span>}<strong>{own ? '내 자리' : hero?.name ?? '미선택'}</strong>{own && <span className="you-label">YOU</span>}</button>;
            })}</div><p className="hint">{team === 'allies' ? '아군이 선택한 영웅을 입력하세요.' : '확인한 상대 영웅만 입력해도 됩니다.'}</p></div>)}</div>
          </section>
          <section className="recommend-section">
            <div className="section-title"><h2><span>03</span> 지금 추천하는 {roleNames[input.role]}</h2><span className="result-tag">{result?.mode === 'gpt' ? `${settings.rankingModel} · ${settings.rankingEffort}${result.cached ? ' · 캐시' : ''}` : isDemo ? '예시 · 로컬 계산' : '로컬 기본 순위'}</span></div>
            <div className="recommend-toolbar"><p><strong>{selected}/9명</strong> 입력됨 <span>·</span> 맵, 티어, 상대 상성, 아군 시너지를 함께 고려합니다.</p><button className="primary" disabled={busy} onClick={() => void recommend()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{busy ? '추천 분석 중…' : isDemo ? '추천 흐름 체험하기' : 'AI로 추천 정렬'}<ArrowRight size={16} /></button></div>
            {result?.warning && <p className="inline-warning" role="status">{result.warning}</p>}
            <div className="recommendations">{display.map((candidate, index) => <RecommendationCard key={candidate.hero.id} candidate={candidate} index={index} snapshot={snapshot} ai={result?.mode === 'gpt'} />)}</div>
            <p className="footnote">점수는 비교를 위한 지표이며 승률이 아닙니다. {result?.mode === 'gpt' ? 'AI 순위와 로컬 점수 순서는 다를 수 있습니다.' : '메타 30% · 맵 25% · 상대 대응 25% · 아군 시너지 20%.'} 알 수 없는 상성은 중립 점수로 계산합니다.</p>
          </section>
        </>}
        <footer><span>OW COMPASS <span className="footer-divider">/</span> BETTER TOGETHER.</span><span>비공식 팬 프로젝트 · Blizzard와 무관합니다.</span></footer>
      </main>
    </div>
    {picker && <HeroPicker snapshot={snapshot} picker={picker} input={input} onClose={() => setPicker(null)} onSelect={heroId => { setInput(i => { const team = [...i[picker.team]]; team[picker.index] = heroId; return { ...i, [picker.team]: team }; }); setPicker(null); }} />}
  </div>;
}

function RecommendationCard({ candidate: c, index, snapshot, ai }: { candidate: Candidate; index: number; snapshot: Snapshot; ai: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const metrics = [['meta', '메타'], ['map', '맵 적합'], ['counter', '상대 대응'], ['synergy', '시너지']] as const;
  return <article className={`recommendation-card ${index === 0 ? 'best' : ''}`}><div className="recommendation-main"><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><HeroMark hero={c.hero} /><div className="hero-description"><div><h3>{c.hero.name}</h3>{index === 0 && <span className="best-label">FIRST PICK</span>}<span className={`tier tier-${c.hero.tier}`}>{c.hero.tier === 'unknown' ? '?' : c.hero.tier}</span></div><p>{c.reasons[0] || '저장된 자료를 기준으로 계산했습니다.'}</p></div><div className="score"><strong>{c.score.toFixed(1)}</strong><span>로컬 점수</span></div><button className="expand" aria-label={`${c.hero.name} 추천 근거 ${expanded ? '접기' : '보기'}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><ChevronRight className={expanded ? 'rotated' : ''} size={19} /></button></div>{expanded && <div className="evidence"><div className="metric-grid">{metrics.map(([key, label]) => <div key={key}><span>{label}<b>{Math.round(c.breakdown[key])}</b></span><div className="metric-track"><div style={{ width: `${c.breakdown[key]}%` }} /></div></div>)}</div><ul>{c.reasons.slice(ai ? 1 : 0, 6).map((reason, i) => <li key={i}>{reason}</li>)}</ul><p className="hint">{c.caution}</p><div className="sources">{snapshot.sources.filter(s => c.sourceIds.includes(s.id)).map(s => <a href={s.url} key={s.id} target="_blank" rel="noreferrer">{s.title}<ExternalLink size={12} /></a>)}</div></div>}</article>;
}

function HeroPicker({ snapshot, picker, input, onClose, onSelect }: { snapshot: Snapshot; picker: { team: 'allies' | 'enemies'; index: number }; input: RecommendationInput; onClose: () => void; onSelect: (id: string | null) => void }) {
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const role = slots[picker.index];
  return <dialog ref={dialogRef} onCancel={onClose} onClick={e => { if (e.target === dialogRef.current) onClose(); }} className="picker"><div className="picker-header"><div><span className="eyebrow">{picker.team === 'allies' ? 'OUR TEAM' : 'ENEMY TEAM'}</span><h2>{roleNames[role]} 선택</h2></div><button onClick={onClose} aria-label="영웅 선택 닫기"><X size={21} /></button></div><div className="search-field"><Search size={18} /><input autoFocus aria-label="영웅 검색" placeholder="영웅 이름 검색" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="picker-grid">{snapshot.heroes.filter(h => h.role === role && `${h.name} ${h.id}`.toLowerCase().includes(query.toLowerCase())).map(hero => <button key={hero.id} disabled={input[picker.team].some((id, index) => id === hero.id && index !== picker.index)} onClick={() => onSelect(hero.id)}><HeroMark hero={hero} /><strong>{hero.name}</strong></button>)}</div><button className="clear-slot" onClick={() => onSelect(null)}>이 자리 비우기</button></dialog>;
}
