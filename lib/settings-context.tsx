"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type VoiceEngine = "server" | "browser";

export type AppSettings = {
  /** Mute mode: no audio in/out, text-only interaction. */
  muted: boolean;
  /** TTS/STT engine preference. server = AI Gateway, browser = Web Speech. */
  voiceEngine: VoiceEngine;
  /** Server TTS voice id (OpenAI tts-1 voices). */
  ttsVoice: string;
  /** Speech rate (0.5 - 1.5). Applies to both engines. */
  rate: number;
  /** Whether the always-on companion is enabled. */
  companionOn: boolean;
  /** Companion hands-free continuous listening. */
  companionAutoListen: boolean;
};

const DEFAULTS: AppSettings = {
  muted: false,
  // Browser speech is the default: free, instant, and needs no API key.
  // Switch to "server" only when AI Gateway audio is configured.
  voiceEngine: "browser",
  ttsVoice: "nova",
  rate: 1,
  companionOn: true,
  companionAutoListen: true,
};

const STORAGE_KEY = "hh-settings-v1";

type Ctx = AppSettings & {
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  toggle: (key: "muted" | "companionOn" | "companionAutoListen") => void;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const loaded = useRef(false);

  // Load persisted settings once on mount (settings only, not app data).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const set: Ctx["set"] = (key, value) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const toggle: Ctx["toggle"] = (key) =>
    setSettings((s) => ({ ...s, [key]: !s[key] }));

  return (
    <SettingsContext.Provider value={{ ...settings, set, toggle }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
