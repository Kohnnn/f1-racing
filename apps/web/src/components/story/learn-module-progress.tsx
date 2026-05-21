"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "f1-racing.learn.progress.v1";
const RECOMMENDED_ORDER = ["car", "aero", "tyres", "braking", "setup", "strategy"] as const;

function readProgress(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeProgress(value: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function LearnModuleProgress({ slug, title }: { slug: string; title: string }) {
  const [read, setRead] = useState<boolean>(false);
  const total = RECOMMENDED_ORDER.length;
  const stepIndex = (RECOMMENDED_ORDER as readonly string[]).indexOf(slug) + 1;

  useEffect(() => {
    const progress = readProgress();
    setRead(!!progress[slug]);
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        const next = readProgress();
        setRead(!!next[slug]);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [slug]);

  function toggle() {
    const previous = readProgress();
    const updated = { ...previous, [slug]: !read };
    writeProgress(updated);
    setRead(!read);
  }

  return (
    <div className="learn-module-progress">
      <div className="learn-module-progress__step">
        <span>Step {stepIndex || "?"}</span>
        <span>of {total}</span>
        <em>· {title}</em>
      </div>
      <button
        type="button"
        className={`learn-module-progress__toggle${read ? " learn-module-progress__toggle--read" : ""}`}
        onClick={toggle}
      >
        {read ? "✓ Read" : "Mark as read"}
      </button>
    </div>
  );
}
