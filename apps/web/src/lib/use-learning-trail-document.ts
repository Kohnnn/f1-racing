"use client";

import { useEffect, useState } from "react";
import {
  getBrowserStorage,
  LEARNING_TRAIL_CHANGE_EVENT,
  LEARNING_TRAIL_STORAGE_KEY,
  readLearningTrail,
  type LearningTrailDocument,
} from "./learning-trail";

export function useLearningTrailDocument() {
  const [document, setDocument] = useState<LearningTrailDocument | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) {
      setStorageAvailable(false);
      return;
    }
    const activeStorage = storage;
    const refresh = () => setDocument(readLearningTrail(activeStorage));
    refresh();
    function onStorage(event: StorageEvent) {
      if (event.key !== LEARNING_TRAIL_STORAGE_KEY) return;
      if (event.newValue === null) {
        setDocument(null);
        return;
      }
      const incoming = readLearningTrail(activeStorage);
      setDocument((current) => !incoming ? null : current && Date.parse(incoming.updatedAt) <= Date.parse(current.updatedAt) ? current : incoming);
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(LEARNING_TRAIL_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LEARNING_TRAIL_CHANGE_EVENT, refresh);
    };
  }, []);

  return { document, setDocument, storageAvailable };
}
