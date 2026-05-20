"use client";

import { useEffect, useState } from "react";
import { learnModules } from "./modules";

const STORAGE_KEY = "f1-racing.learn.progress.v1";
const RECOMMENDED_ORDER = ["car", "aero", "tyres", "braking", "setup", "strategy"] as const;

function readProgress(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, boolean> : {};
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

export function LearnIndex() {
  const [progress, setProgress] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setProgress(readProgress());
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        setProgress(readProgress());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function toggleRead(slug: string, next: boolean) {
    setProgress((previous) => {
      const updated = { ...previous, [slug]: next };
      writeProgress(updated);
      return updated;
    });
  }

  const completed = RECOMMENDED_ORDER.filter((slug) => progress[slug]).length;
  const total = RECOMMENDED_ORDER.length;
  const percent = Math.round((completed / total) * 100);
  const nextSlug = RECOMMENDED_ORDER.find((slug) => !progress[slug]) ?? RECOMMENDED_ORDER[0];
  const nextModule = learnModules.find((module) => module.slug === nextSlug);

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Learn surface</p>
        <h1>Break the car into focused engineering reads.</h1>
        <p className="lead">
          Six short modules. Mark each as read once you have walked through it; we will keep your progress in this browser.
        </p>
      </section>

      <section className="learn-progress">
        <div>
          <p className="eyebrow">Recommended order</p>
          <strong>{completed} / {total} read</strong>
          <span>{percent}%</span>
        </div>
        <div className="learn-progress__bar">
          <div className="learn-progress__fill" style={{ width: `${percent}%` }} />
        </div>
        {nextModule ? (
          <a className="button button--secondary" href={`/learn/${nextModule.slug}`}>
            Continue with {nextModule.title}
          </a>
        ) : null}
      </section>

      <section className="panel-grid panel-grid--three">
        {RECOMMENDED_ORDER.map((slug, index) => {
          const module = learnModules.find((entry) => entry.slug === slug);
          if (!module) return null;
          const read = !!progress[slug];
          return (
            <article key={slug} className={`learn-card${read ? " learn-card--read" : ""}`}>
              <p className="eyebrow">{`/learn/${module.slug}`}</p>
              <span className="learn-card__order">Step {index + 1} of {total}</span>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <div className="learn-card__actions">
                <a className="button" href={`/learn/${module.slug}`}>Open module</a>
                <button
                  type="button"
                  className={`learn-card__toggle${read ? " learn-card__toggle--active" : ""}`}
                  onClick={() => toggleRead(slug, !read)}
                >
                  {read ? "Mark unread" : "Mark as read"}
                </button>
              </div>
              <ul className="learn-card__links">
                {module.nextLinks.map((link) => (
                  <li key={link.href}>
                    <a href={link.href}>{link.label} →</a>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">How to use Learn</p>
            <h2>Move between replay, model, and explanation.</h2>
          </div>
        </div>
        <p>
          Each chapter pairs with the 3D model and replay workspace: inspect a part, watch how it affects the car on track, then return here for the engineering context.
        </p>
      </section>
    </div>
  );
}
