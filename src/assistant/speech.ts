import { useCallback, useEffect, useRef, useState } from 'react';

/* Minimal Web Speech API types (not in TypeScript's DOM lib). */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}
interface SpeechEvent {
  resultIndex: number;
  results: SpeechResultList;
}
interface SpeechErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return !!getCtor();
}

export type SpeechStatus = 'idle' | 'listening' | 'unsupported' | 'denied' | 'no-speech' | 'error';

/**
 * Mic → text. `onText(spoken)` is called while he speaks with the words heard so far
 * (the caller fills the message box). It never sends anything.
 */
export function useSpeech(lang: string, onText: (spoken: string) => void) {
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const recRef = useRef<Recognition | null>(null);
  const cbRef = useRef(onText);
  cbRef.current = onText;

  useEffect(() => () => recRef.current?.abort(), []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setStatus('unsupported');
      return;
    }
    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let spoken = '';
      for (let i = 0; i < e.results.length; i++) spoken += e.results[i][0]?.transcript ?? '';
      cbRef.current(spoken.trim());
    };
    rec.onerror = (e) => {
      setStatus(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' ? 'no-speech' : e.error === 'aborted' ? 'idle' : 'error');
    };
    rec.onend = () => {
      recRef.current = null;
      setStatus((s) => (s === 'listening' ? 'idle' : s));
    };
    recRef.current = rec;
    try {
      rec.start();
      setStatus('listening');
    } catch {
      setStatus('error');
    }
  }, [lang]);

  return { status, start, stop, listening: status === 'listening' };
}
