import { useEffect, useId, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { IconCheck, IconWarning } from '@/components/ui/icons';
import { DEFAULT_MODEL, MODEL_OPTIONS, hasCredentials, testConnection } from './client';
import { resetAllConversations } from './conversation';

/** Settings → "Claude assistant" (embedded by the Settings screen). */
export default function AssistantSettingsCard() {
  const assistant = useAppStore((s) => s.assistant);
  const update = useAppStore((s) => s.updateAssistant);
  const ids = { key: useId(), model: useId(), voice: useId(), proxy: useId(), keyHelp: useId() };

  const [keyText, setKeyText] = useState(assistant.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [proxyText, setProxyText] = useState(assistant.proxyUrl);
  const [saved, setSaved] = useState<string | null>(null);
  const [test, setTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }>({ state: 'idle' });

  useEffect(() => setKeyText(assistant.apiKey), [assistant.apiKey]);
  useEffect(() => setProxyText(assistant.proxyUrl), [assistant.proxyUrl]);

  const on = hasCredentials(assistant);
  const keyDirty = keyText.trim() !== assistant.apiKey;
  const knownModel = MODEL_OPTIONS.some((m) => m.id === assistant.model);

  const saveKey = () => {
    update({ apiKey: keyText.trim() });
    resetAllConversations();
    setSaved(keyText.trim() ? 'Key saved on this phone.' : 'Key removed.');
    setTest({ state: 'idle' });
  };
  const removeKey = () => {
    update({ apiKey: '' });
    setKeyText('');
    resetAllConversations();
    setSaved('Key removed from this phone.');
    setTest({ state: 'idle' });
  };
  const runTest = async () => {
    setTest({ state: 'testing' });
    const settings = { ...assistant, apiKey: keyText.trim() || assistant.apiKey, proxyUrl: proxyText.trim() };
    const r = await testConnection(settings);
    setTest(r.ok ? { state: 'ok', message: 'Connected. Claude is ready.' } : { state: 'fail', message: r.message });
  };

  return (
    <section aria-labelledby="assistant-settings-title" className="flex flex-col gap-4 rounded-[18px] border border-paper-line bg-white p-4">
      <div className="flex items-center gap-3">
        <h2 id="assistant-settings-title" className="flex-1 font-display text-lg font-semibold">
          Claude assistant
        </h2>
        <span
          className={on ? 'rounded-full bg-brand-soft px-3 py-1 text-[14px] font-semibold text-brand' : 'rounded-full bg-paper-sunk px-3 py-1 text-[14px] font-semibold text-ink-muted'}
          data-testid="assistant-status"
        >
          {on ? 'On' : 'Off'}
        </span>
      </div>
      <p className="text-[15px] leading-relaxed text-ink-muted">Change the menu by typing or speaking in English, Tamil or Tanglish. Claude always shows the change first.</p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.key} className="text-[15px] font-semibold text-ink">
          Claude API key
        </label>
        <div className="flex gap-2">
          <input
            id={ids.key}
            type={showKey ? 'text' : 'password'}
            value={keyText}
            onChange={(e) => {
              setKeyText(e.target.value);
              setSaved(null);
            }}
            placeholder="sk-ant-…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={ids.keyHelp}
            className={inputClass + ' min-w-0 flex-1 font-mono text-[15px]'}
          />
          <Button variant="secondary" onClick={() => setShowKey((v) => !v)} aria-pressed={showKey} className="shrink-0">
            {showKey ? 'Hide' : 'Show'}
          </Button>
        </div>
        <p id={ids.keyHelp} className="text-sm text-ink-muted">
          Get a key at console.anthropic.com → API keys. The key stays on this phone only and is not included in backups.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={saveKey} disabled={!keyDirty}>
            Save
          </Button>
          {assistant.apiKey && (
            <Button variant="danger" onClick={removeKey}>
              Remove key
            </Button>
          )}
        </div>
        {saved && (
          <p role="status" className="text-[15px] font-medium text-brand">
            {saved}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.model} className="text-[15px] font-semibold text-ink">
          Model
        </label>
        <select
          id={ids.model}
          value={knownModel ? assistant.model : assistant.model || DEFAULT_MODEL}
          onChange={(e) => {
            update({ model: e.target.value });
            setTest({ state: 'idle' });
          }}
          className={inputClass}
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          {!knownModel && assistant.model && <option value={assistant.model}>{assistant.model}</option>}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.voice} className="text-[15px] font-semibold text-ink">
          Voice language
        </label>
        <select id={ids.voice} value={assistant.voiceLang} onChange={(e) => update({ voiceLang: e.target.value as 'en-IN' | 'ta-IN' })} className={inputClass}>
          <option value="en-IN">English (India)</option>
          <option value="ta-IN">Tamil</option>
        </select>
        <p className="text-sm text-ink-muted">Used by the Speak button in chat.</p>
      </div>

      <details className="rounded-2xl border border-paper-line p-3">
        <summary className="min-h-[44px] cursor-pointer py-2 text-[15px] font-semibold">Advanced: proxy URL</summary>
        <div className="flex flex-col gap-1.5 pt-2">
          <label htmlFor={ids.proxy} className="text-[15px] font-semibold text-ink">
            Proxy URL
          </label>
          <input
            id={ids.proxy}
            value={proxyText}
            onChange={(e) => setProxyText(e.target.value)}
            onBlur={() => {
              if (proxyText.trim() !== assistant.proxyUrl) {
                update({ proxyUrl: proxyText.trim() });
                resetAllConversations();
              }
            }}
            placeholder="/api/claude"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className={inputClass}
          />
          <p className="text-sm text-ink-muted">Only if the website has its own Claude proxy (the key then stays on the server, not on this phone). Leave empty otherwise.</p>
        </div>
      </details>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={() => void runTest()} disabled={test.state === 'testing' || !(keyText.trim() || assistant.apiKey || proxyText.trim())}>
          {test.state === 'testing' ? 'Testing…' : 'Test connection'}
        </Button>
        {test.state === 'ok' && (
          <p role="status" className="flex items-center gap-1.5 text-[15px] font-semibold text-brand">
            <IconCheck size={18} /> {test.message}
          </p>
        )}
        {test.state === 'fail' && (
          <p role="alert" className="flex items-start gap-1.5 text-[15px] font-semibold text-danger">
            <IconWarning size={18} className="mt-0.5 shrink-0" /> {test.message}
          </p>
        )}
      </div>
    </section>
  );
}
