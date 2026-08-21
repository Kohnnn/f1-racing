"use client";

import { LearningTrail } from "@/components/story/learning-trail";
import {
  getBrowserStorage,
  LEARNING_TRAIL_CHANGE_EVENT,
  updateModuleRead,
} from "@/lib/learning-trail";
import { useLearningTrailDocument } from "@/lib/use-learning-trail-document";
import { learnModules } from "./modules";

const RECOMMENDED_ORDER = ["car", "aero", "tyres", "braking", "setup", "strategy"] as const;

export function LearnIndex() {
  const { document, setDocument, storageAvailable } = useLearningTrailDocument();
  const progress = document?.modules ?? {};

  function toggleRead(slug: (typeof RECOMMENDED_ORDER)[number], next: boolean) {
    const storage = getBrowserStorage();
    if (!storage) return;
    const updated = updateModuleRead(storage, slug, next);
    setDocument(updated);
    if (updated) window.dispatchEvent(new Event(LEARNING_TRAIL_CHANGE_EVENT));
  }

  const readCount = RECOMMENDED_ORDER.filter((slug) => progress[slug]?.readAt).length;
  const completedCount = RECOMMENDED_ORDER.filter((slug) => progress[slug]?.completedAt).length;
  const total = RECOMMENDED_ORDER.length;
  const percent = Math.round((readCount / total) * 100);
  const nextSlug = RECOMMENDED_ORDER.find((slug) => !progress[slug]?.readAt) ?? RECOMMENDED_ORDER[0];
  const nextModule = learnModules.find((module) => module.slug === nextSlug);

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Learn surface</p>
        <h1>Break the car into focused engineering reads.</h1>
        <p className="lead">Six short modules. Explicit Read and Completed states stay in this browser.</p>
        {!storageAvailable ? <p role="status">This browser cannot save progress for this session.</p> : null}
      </section>

      <LearningTrail />

      <section className="learn-progress">
        <div>
          <p className="eyebrow">Recommended order</p>
          <strong>{readCount} / {total} Read · {completedCount} Completed</strong>
          <span>{percent}% Read</span>
        </div>
        <div className="learn-progress__bar" aria-label={`${percent}% Read`}>
          <div className="learn-progress__fill" style={{ width: `${percent}%` }} />
        </div>
        {nextModule ? <a className="button button--secondary" href={`/learn/${nextModule.slug}`}>Continue with {nextModule.title}</a> : null}
      </section>

      <section className="panel-grid panel-grid--three">
        {RECOMMENDED_ORDER.map((slug, index) => {
          const module = learnModules.find((entry) => entry.slug === slug);
          if (!module) return null;
          const state = progress[slug];
          return (
            <article key={slug} className={`learn-card${state?.readAt ? " learn-card--read" : ""}`}>
              <p className="eyebrow">{`/learn/${module.slug}`}</p>
              <span className="learn-card__order">Step {index + 1} of {total}</span>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <p><strong>{state?.completedAt ? "Completed" : state?.readAt ? "Read" : "Not read"}</strong></p>
              <div className="learn-card__actions">
                <a className="button" href={`/learn/${module.slug}`}>Open module</a>
                <button type="button" className={`learn-card__toggle${state?.readAt ? " learn-card__toggle--active" : ""}`} onClick={() => toggleRead(slug, !state?.readAt)}>
                  {state?.readAt ? "Mark unread" : "Mark as read"}
                </button>
              </div>
              <ul className="learn-card__links">
                {module.nextLinks.map((link) => <li key={link.href}><a href={link.href}>{link.label} →</a></li>)}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="panel">
        <div className="section-header"><div><p className="eyebrow">How to use Learn</p><h2>Move between replay, model, and explanation.</h2></div></div>
        <p>Each chapter pairs with the 3D model and replay workspace: inspect a part, watch how it affects the car on track, then return here for the engineering context.</p>
      </section>
    </div>
  );
}
