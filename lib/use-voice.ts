"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "./settings-context";
import { stripMarkdown } from "./format";

type SpeakOpts = { onEnd?: () => void };

export function useVoice() {
  const { voiceEngine, muted, rate, ttsVoice } = useSettings();
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const resolveRef = useRef<((t: string) => void) | null>(null);
  // Once server TTS is unavailable (e.g. gateway rate limit), route all
  // subsequent speech to the browser engine to avoid repeated failing calls.
  const serverTtsDownRef = useRef(false);

  const browserSRAvailable =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const speakBrowser = useCallback(
    (text: string, opts?: SpeakOpts) => {
      if (!("speechSynthesis" in window)) {
        opts?.onEnd?.();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      u.rate = rate;
      const voices = window.speechSynthesis.getVoices();
      const ja =
        voices.find((v) => v.lang === "ja-JP") ||
        voices.find((v) => v.lang?.startsWith("ja"));
      if (ja) u.voice = ja;
      u.onend = () => {
        setSpeaking(false);
        opts?.onEnd?.();
      };
      u.onerror = () => {
        setSpeaking(false);
        opts?.onEnd?.();
      };
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    [rate],
  );

  const speak = useCallback(
    async (raw: string, opts?: SpeakOpts) => {
      // Markdown never reads well aloud ("アスタリスク アスタリスク").
      const text = raw ? stripMarkdown(raw) : raw;
      // Mute mode: never play audio; UI still shows text.
      if (muted || !text?.trim()) {
        opts?.onEnd?.();
        return;
      }
      stopSpeaking();

      // Browser engine, or server TTS already known to be unavailable.
      if (voiceEngine === "browser" || serverTtsDownRef.current) {
        speakBrowser(text, opts);
        return;
      }

      try {
        setSpeaking(true);
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: ttsVoice, speed: rate }),
        });
        if (!res.ok) {
          // Remember server audio is down so we skip it next time.
          serverTtsDownRef.current = true;
          throw new Error("tts failed");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
          opts?.onEnd?.();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
          opts?.onEnd?.();
        };
        await audio.play();
      } catch {
        speakBrowser(text, opts);
      }
    },
    [voiceEngine, muted, ttsVoice, rate, speakBrowser, stopSpeaking],
  );

  const startBrowserRecognition = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const SR =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SR) {
        resolve("");
        return;
      }
      const rec = new SR();
      rec.lang = "ja-JP";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      recognitionRef.current = rec;
      let done = false;
      const finish = (t: string) => {
        if (done) return;
        done = true;
        setRecording(false);
        recognitionRef.current = null;
        resolve(t);
      };
      rec.onresult = (e: any) => finish(e.results[0][0].transcript);
      rec.onerror = () => finish("");
      rec.onend = () => finish("");
      setRecording(true);
      rec.start();
    });
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    if (recording) return;
    // Prefer live browser recognition whenever available: it is instant,
    // free, loses no audio, and works offline. Server upload is only used as
    // a fallback for browsers without the Web Speech recognition API.
    if (voiceEngine === "browser" || browserSRAvailable) {
      const t = await startBrowserRecognition();
      resolveRef.current?.(t);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      const t = await startBrowserRecognition();
      resolveRef.current?.(t);
    }
  }, [voiceEngine, recording, startBrowserRecognition, browserSRAvailable]);

  const stopRecording = useCallback(async (): Promise<string> => {
    // Live browser recognition path (matches startRecording preference).
    if (voiceEngine === "browser" || browserSRAvailable) {
      const rec = recognitionRef.current;
      if (rec) rec.stop();
      return new Promise((resolve) => {
        resolveRef.current = resolve;
      });
    }
    const mr = mediaRef.current;
    if (!mr) {
      setRecording(false);
      return "";
    }
    return new Promise<string>((resolve) => {
      mr.onstop = async () => {
        setRecording(false);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        mediaRef.current = null;
        if (blob.size === 0) return resolve("");
        try {
          setTranscribing(true);
          const form = new FormData();
          form.append("audio", blob, "speech.webm");
          const res = await fetch("/api/stt", { method: "POST", body: form });
          const data = await res.json();
          resolve(data.text || "");
        } catch {
          resolve("");
        } finally {
          setTranscribing(false);
        }
      };
      mr.stop();
    });
  }, [voiceEngine, browserSRAvailable]);

  // Listen for a single utterance, resolving with the transcript when the
  // browser detects end-of-speech (silence). Used by the hands-free companion
  // loop. Requires the browser Web Speech recognition API.
  const listenOnce = useCallback((): Promise<string> => {
    if (!browserSRAvailable) return Promise.resolve("");
    return startBrowserRecognition();
  }, [browserSRAvailable, startBrowserRecognition]);

  const abortListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.abort ? rec.abort() : rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      stopSpeaking();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stopSpeaking]);

  return {
    recording,
    speaking,
    transcribing,
    browserSRAvailable,
    speak,
    stopSpeaking,
    startRecording,
    stopRecording,
    listenOnce,
    abortListening,
  };
}
