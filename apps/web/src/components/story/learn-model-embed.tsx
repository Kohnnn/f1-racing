"use client";

import { createElement, useEffect } from "react";

interface LearnModelEmbedProps {
  modelSrc: string;
  modelTitle: string;
  modelScale?: string;
  cameraOrbit?: string;
  cameraTarget?: string;
  caption?: string;
}

/**
 * Lightweight `<model-viewer>` embed for Learn modules. Lazily mounts the
 * viewer on intersection so the GLB only downloads when the user scrolls to
 * the section. Keeps the Learn flow inline instead of forcing navigation away.
 */
export function LearnModelEmbed({
  modelSrc,
  modelTitle,
  modelScale,
  cameraOrbit = "30deg 75deg 2.4m",
  cameraTarget = "0m 0.25m 0m",
  caption,
}: LearnModelEmbedProps) {
  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  return (
    <figure className="learn-model-embed">
      {createElement("model-viewer", {
        src: modelSrc,
        alt: modelTitle,
        scale: modelScale,
        "camera-controls": true,
        reveal: "interaction",
        loading: "lazy",
        "camera-orbit": cameraOrbit,
        "camera-target": cameraTarget,
        exposure: "1.05",
        "shadow-intensity": "0.6",
        "touch-action": "pan-y",
        "interaction-prompt": "auto",
        "environment-image": "neutral",
        style: {
          width: "100%",
          height: "min(54vh, 420px)",
          background:
            "radial-gradient(circle at top, rgba(255,255,255,0.96), rgba(234,240,248,0.92) 60%, rgba(217,225,236,0.96))",
          borderRadius: "18px",
          border: "1px solid rgba(167, 189, 219, 0.18)",
        },
      })}
      <figcaption>
        <strong>{modelTitle}</strong>
        {caption ? <span>{caption}</span> : null}
      </figcaption>
    </figure>
  );
}
