"use client";

import { useState } from "react";
import {
  getBrowserStorage,
  LEARNING_TRAIL_CHANGE_EVENT,
  updateModuleCompletion,
  updateModuleRead,
  type LearnModuleId,
  type LearningModuleProgress,
} from "@/lib/learning-trail";
import { useLearningTrailDocument } from "@/lib/use-learning-trail-document";

const RECOMMENDED_ORDER = ["car", "aero", "tyres", "braking", "setup", "strategy"] as const;

interface LearnModuleProgressProps {
  slug: LearnModuleId;
  title: string;
  check?: {
    question: string;
    options: readonly { id: string; label: string }[];
    answer: string;
  };
}

export function LearnModuleProgress({ slug, title, check }: LearnModuleProgressProps) {
  const { document, setDocument, storageAvailable } = useLearningTrailDocument();
  const progress: LearningModuleProgress | undefined = document?.modules[slug];
  const [answer, setAnswer] = useState("");
  const [checkStatus, setCheckStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const stepIndex = RECOMMENDED_ORDER.indexOf(slug) + 1;

  function setRead(read: boolean) {
    const storage = getBrowserStorage();
    const next = storage ? updateModuleRead(storage, slug, read) : null;
    if (!next) {
      setSaveStatus("This browser could not save progress.");
      return;
    }
    setDocument(next);
    window.dispatchEvent(new Event(LEARNING_TRAIL_CHANGE_EVENT));
    setSaveStatus(read ? "Marked Read." : "Read and Completed states removed.");
  }

  function submitCheck(event: React.FormEvent) {
    event.preventDefault();
    if (!check || !answer) {
      setCheckStatus("Choose an answer before submitting.");
      return;
    }
    if (answer !== check.answer) {
      setCheckStatus("Not correct yet. Review the key points and try again.");
      return;
    }
    const storage = getBrowserStorage();
    const next = storage ? updateModuleCompletion(storage, slug, true) : null;
    if (!next) {
      setSaveStatus("This browser could not save progress.");
      return;
    }
    setDocument(next);
    window.dispatchEvent(new Event(LEARNING_TRAIL_CHANGE_EVENT));
    setCheckStatus("Correct. This module is marked Completed and Read.");
  }

  return (
    <div className="learn-module-progress">
      <div className="learn-module-progress__step">
        <span>Step {stepIndex}</span>
        <span>of {RECOMMENDED_ORDER.length}</span>
        <em>· {title}</em>
        <strong>{progress?.completedAt ? "Completed" : progress?.readAt ? "Read" : "Not read"}</strong>
      </div>
      <button
        type="button"
        className={`learn-module-progress__toggle${progress?.readAt ? " learn-module-progress__toggle--read" : ""}`}
        onClick={() => setRead(!progress?.readAt)}
      >
        {progress?.readAt ? "Mark unread" : "Mark as read"}
      </button>
      {check ? (
        <form id="check" className="learn-check" onSubmit={submitCheck}>
          <fieldset>
            <legend>{check.question}</legend>
            {check.options.map((option) => (
              <label key={option.id}>
                <input
                  type="radio"
                  name={`${slug}-check`}
                  value={option.id}
                  checked={answer === option.id}
                  onChange={(event) => setAnswer(event.target.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <button type="submit">Check answer</button>
          <p role="status" aria-live="polite">{checkStatus}</p>
        </form>
      ) : null}
      <p role="status" aria-live="polite">{storageAvailable ? saveStatus : "This browser could not save progress."}</p>
    </div>
  );
}
