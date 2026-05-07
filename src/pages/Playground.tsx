import { useState } from "react";
import { TimerStrip } from "@/components";

/**
 * UI Playground — `/dev`
 *
 * Dev-only page (Vite strips it from production builds via the router guard).
 * The TimerStrip lives at the very top as a sticky header so it's always
 * visible while scrolling through component demos below.
 *
 * To add a new component demo: append a <section> inside the scrollable area.
 */

const DEMO_TOTAL_SECONDS = 90;

export default function Playground() {
  const [running, setRunning] = useState(false);

  function handleToggle() {
    setRunning((prev) => !prev);
  }

  function handleComplete() {
    setRunning(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* ── Timer strip — sticky header ──────────────────────────────────── */}
      <div className="sticky top-0 z-10 w-full">
        <TimerStrip
          endsAt={null}
          totalSeconds={DEMO_TOTAL_SECONDS}
          running={running}
          onToggle={handleToggle}
          onComplete={handleComplete}
        />
      </div>

      {/* ── Scrollable demo area ─────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-md flex-1 space-y-10 px-4 py-8">
        <header>
          <h1 className="text-2xl font-bold text-accent">UI Playground</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Dev-only. Tap the bar above to start/pause the timer.
          </p>
        </header>

        {/* ── Section: TimerStrip ──────────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
            TimerStrip
          </h2>

          {/* Display-only variant (no toggle) */}
          <p className="mb-2 text-xs text-fg-muted">
            Display-only (mirrors header state)
          </p>
          <TimerStrip
            endsAt={null}
            totalSeconds={DEMO_TOTAL_SECONDS}
            running={running}
          />

          <p className="mb-2 mt-6 text-xs text-fg-muted">
            Static pre-start (always full bar)
          </p>
          <TimerStrip
            endsAt={null}
            totalSeconds={DEMO_TOTAL_SECONDS}
            running={false}
          />

          <p className="mb-2 mt-6 text-xs text-fg-muted">
            Interactive (with toggle — independent instance)
          </p>
          <TimerStrip
            endsAt={null}
            totalSeconds={DEMO_TOTAL_SECONDS}
            running={running}
            onToggle={handleToggle}
            onComplete={handleComplete}
          />
        </section>

        {/* ── Add more component sections below ───────────────────────────── */}
      </main>
    </div>
  );
}
