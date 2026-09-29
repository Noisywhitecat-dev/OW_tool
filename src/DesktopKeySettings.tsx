import { useState } from 'react';
import type { Settings } from '../shared/schema';
declare global { interface Window { owDesktop?: { saveKey(provider: 'gemini' | 'openai', value: string): Promise<{ ok: boolean; error?: string }> } } }
export function DesktopKeySettings({ provider, disabled, onSaved }: { provider: Settings['provider']; disabled: boolean; onSaved: () => Promise<void> }) {
  const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const save = async (remove = false) => {
    setBusy(true); setMessage('');
    try {
      const result = await window.owDesktop!.saveKey(provider, remove ? '' : key);
      if (!result.ok) throw new Error(result.error);
      setKey(''); await onSaved(); setMessage(remove ? '이 제공자의 저장된 키를 삭제했습니다.' : 'Windows 계정에 암호화하여 저장했습니다. 바로 사용할 수 있습니다.');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  return <fieldset disabled={disabled || busy}><label htmlFor="desktop-key">{provider === 'gemini' ? 'Gemini' : 'OpenAI'} API 키</label><input id="desktop-key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="키를 입력하세요 · 저장된 값은 표시하지 않습니다" />
    <div className="settings-actions"><button className="primary" disabled={!key.trim()} onClick={() => void save()}>키 저장</button><button className="secondary" onClick={() => void save(true)}>저장된 키 삭제</button></div><p className="hint">키는 이 Windows 사용자 계정에 암호화하여 보관합니다. 브라우저 저장소나 프로젝트 파일에는 저장하지 않습니다.</p>{message && <p role="status" className="hint">{message}</p>}</fieldset>;
}
