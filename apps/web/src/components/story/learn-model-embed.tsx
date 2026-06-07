"use client";

import { createElement, useEffect, useRef, useState } from "react";
import { ensureModelViewerLoaded } from "@/lib/model-viewer-loader";

interface LearnModelEmbedProps {
  modelSrc: string;
  modelTitle: string;
  modelScale?: string;
  cameraOrbit?: string;
  cameraTarget?: string;
  caption?: string;
}

/**
 * Lightweight `<model-viewer>` embed for Learn modules. Mounts a real
 * loading skeleton until the GLB reports `load`, and shows an explicit
 * error state if the file fails. Replaces the previous version that left
 * a blank white canvas because `reveal="interaction"` waited for a click
 * that the reader never made.
 */
export function LearnModelEmbed({
  modelSrc,
  modelTitle,
  modelScale,
  cameraOrbit = "30deg 75deg 2.4m",
  cameraTarget = "0m 0.25m 0m",
  caption,
}: LearnModelEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"booting" | "loading" | "ready" | "error">("booting");
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    ensureModelViewerLoaded()
      .then(() => {
        if (!cancelled) setStatus("loading");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status === "booting") return;
    const node = containerRef.current?.querySelector("model-viewer");
    if (!node) return;

    const onLoad = () => setStatus("ready");
    const onError = () => setStatus("error");
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ totalProgress?: number }>).detail;
      if (detail && typeof detail.totalProgress === "number") {
        setProgress(Math.max(0, Math.min(1, detail.totalProgress)));
      }
    };

    node.addEventListener("load", onLoad);
    node.addEventListener("error", onError);
    node.addEventListener("progress", onProgress as EventListener);
    return () => {
      node.removeEventListener("load", onLoad);
      node.removeEventListener("error", onError);
      node.removeEventListener("progress", onProgress as EventListener);
    };
  }, [status]);

  return (
    <figure className="learn-model-embed" ref={containerRef}>
      <div className="learn-model-embed__viewer">
        {status !== "error"
          ? createElement("model-viewer", {
              src: modelSrc,
              alt: modelTitle,
              scale: modelScale,
              "camera-controls": true,
              "auto-rotate": true,
              "auto-rotate-delay": 1200,
              "rotation-per-second": "12deg",
              reveal: "auto",
              loading: "eager",
              "camera-orbit": cameraOrbit,
              "camera-target": cameraTarget,
              exposure: "1.0",
              "shadow-intensity": "0.7",
              "shadow-softness": "0.85",
              "touch-action": "pan-y",
              "interaction-prompt": "auto",
              "interaction-prompt-style": "wiggle",
              "environment-image": "neutral",
              style: {
                width: "100%",
                height: "100%",
                background:
                  "radial-gradient(circle at top, rgba(20,28,42,0.95), rgba(8,11,18,0.96) 60%, rgba(4,6,12,1))",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                display: "block",
              },
            })
          : null}
        {status !== "ready" ? (
          <div
            className={`learn-model-embed__overlay learn-model-embed__overlay--${status}`}
            role="status"
            aria-live="polite"
          >
            <div className="learn-model-embed__spinner" aria-hidden="true" />
            <p>
              {status === "booting"
                ? `Booting model viewer`
                : status === "error"
                  ? `Model unavailable`
                  : `Loading ${modelTitle}`}
            </p>
            {status === "loading" ? (
              <div className="learn-model-embed__bar" aria-hidden="true">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            ) : null}
            {status === "error" ? (
              <p className="learn-model-embed__error-hint">
                The 3D viewer or asset failed to load. This page remains usable
                without the embedded model.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <figcaption>
        <strong>{modelTitle}</strong>
        {caption ? <span>{caption}</span> : null}
        <span className="learn-model-embed__hint">Drag to rotate · scroll to zoom</span>
      </figcaption>
    </figure>
  );
}
