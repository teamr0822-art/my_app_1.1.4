"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** What broke, in the visitor's words: 「地図」「案内」 etc. */
  label?: string;
  /** Optional escape hatch, e.g. go back to the home screen. */
  onReset?: () => void;
};

type State = { error: Error | null };

/**
 * Keeps one broken part from taking the whole app down.
 *
 * Leaflet, the Web Speech API and the geolocation stack all touch browser
 * features that behave differently on every device, and a single throw inside
 * one of them used to render a blank white screen with no way out. Here the
 * rest of the app keeps working and the visitor gets a button.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[v0] UI error", error);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const what = this.props.label ?? "この画面";
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <p className="text-base font-semibold text-[var(--color-ink)]">
          {what}の表示に失敗しました
        </p>
        <p className="max-w-xs text-sm leading-relaxed text-[var(--color-ink-soft)]">
          一時的な不具合の可能性があります。もう一度読み込むか、他の画面をお試しください。
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="rounded-full bg-[var(--color-terracotta)] px-5 py-2 text-sm font-semibold text-white"
          >
            もう一度試す
          </button>
          <button
            type="button"
            onClick={() => location.reload()}
            className="rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-semibold text-[var(--color-ink)]"
          >
            アプリを再読み込み
          </button>
        </div>
      </div>
    );
  }
}
