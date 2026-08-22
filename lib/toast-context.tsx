"use client";

import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; msg: string };
type Ctx = { toast: (msg: string) => void };

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 bottom-28 z-[900] flex flex-col items-center gap-2 px-5"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="anim-toast max-w-full rounded-xl bg-[#332a20]/95 px-4 py-2.5 text-[12.5px] leading-relaxed text-white shadow-lg"
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
