"use client";

import { useState } from "react";
import {
  clearLearningTrail,
  getBrowserStorage,
  getLearningTrailResumeHrefs,
  LEARNING_TRAIL_CHANGE_EVENT,
  serializeLearningTrail,
} from "@/lib/learning-trail";
import { useLearningTrailDocument } from "@/lib/use-learning-trail-document";

const BRIEF_LABELS = {
  "monza-braking": "Monza braking",
  "mexico-aero": "Mexico aero",
  "zandvoort-strategy-tyres": "Zandvoort strategy and tyres",
} as const;

export function LearningTrail() {
  const { document, setDocument, storageAvailable } = useLearningTrailDocument();
  const [status, setStatus] = useState("");
  const resume = document ? getLearningTrailResumeHrefs(document) : null;

  function exportTrail() {
    if (!document) return;
    const raw = serializeLearningTrail(document);
    if (!raw) {
      setStatus("Local progress could not be exported.");
      return;
    }
    const url = URL.createObjectURL(new Blob([`${raw}\n`], { type: "application/json" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "f1-racing-learning-trail.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Local progress exported.");
  }

  function clearTrail() {
    try {
      const storage = getBrowserStorage();
      if (!storage || !clearLearningTrail(storage)) throw new Error();
      setDocument(null);
      window.dispatchEvent(new Event(LEARNING_TRAIL_CHANGE_EVENT));
      setStatus("Local progress and trail cleared from this browser.");
    } catch {
      setStatus("This browser could not clear local progress.");
    }
  }

  return (
    <section className="learning-trail" aria-labelledby="local-learning-trail-title">
      <h2 id="local-learning-trail-title">Your learning trail</h2>
      <p>
        Progress and your most recent learning trail stay in this browser only. Nothing is sent to us. Clearing site data, using private browsing, or changing browser or device can remove it. Replay links keep their own shareable state.
      </p>
      {!storageAvailable ? <p role="status">This browser cannot save progress for this session. Resume will be unavailable after reload.</p> : null}
      {resume ? (
        <div className="learning-trail__resume">
          <strong>{BRIEF_LABELS[resume.briefId]}</strong>
          <a className="button" href={resume.replayHref ?? resume.learnHref ?? resume.modelviewHref}>Resume</a>
          <span>Open a specific surface:</span>
          <a href={resume.learnHref}>Learn</a>
          {resume.modelviewHref ? <a href={resume.modelviewHref}>Modelview</a> : null}
          {resume.replayHref ? <a href={resume.replayHref}>Replay evidence</a> : null}
        </div>
      ) : null}
      <div className="learning-trail__actions">
        {document ? <button type="button" onClick={exportTrail}>Export local progress</button> : null}
        <button type="button" onClick={clearTrail}>Clear local progress and trail</button>
      </div>
      <p role="status" aria-live="polite">{status}</p>
    </section>
  );
}
