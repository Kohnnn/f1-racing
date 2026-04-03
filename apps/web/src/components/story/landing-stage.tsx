"use client";

import { createElement, useEffect } from "react";

interface LandingStageProps {
  modelSrc: string;
  modelTitle: string;
  sizeLabel: string;
  replayLabel: string;
  learnLabel: string;
  note: string;
}

export function LandingStage({
  modelSrc,
  modelTitle,
  sizeLabel,
  replayLabel,
  learnLabel,
  note,
}: LandingStageProps) {
  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  return (
    <div className="landing-stage-v2">
      <div className="landing-stage-v2__frame">
        <div className="landing-stage-v2__beam landing-stage-v2__beam--top" />
        <div className="landing-stage-v2__beam landing-stage-v2__beam--mid" />
        <div className="landing-stage-v2__beam landing-stage-v2__beam--bottom" />

        {createElement("model-viewer", {
          className: "landing-stage-v2__viewer",
          src: modelSrc,
          alt: modelTitle,
          reveal: "auto",
          loading: "eager",
          "camera-controls": true,
          "auto-rotate": true,
          "auto-rotate-delay": 0,
          "rotation-per-second": "18deg",
          "camera-orbit": "32deg 78deg 2.45m",
          "camera-target": "0m 0.23m 0m",
          exposure: "1.08",
          "shadow-intensity": "1",
          "touch-action": "pan-y",
          "interaction-prompt": "none",
          "environment-image": "neutral",
        })}

        <div className="landing-stage-v2__panel landing-stage-v2__panel--status">
          <span>Car reference</span>
          <strong>{modelTitle}</strong>
          <p>{sizeLabel}</p>
        </div>

        <div className="landing-stage-v2__panel landing-stage-v2__panel--telemetry">
          <span>Live aero map</span>
          <dl>
            <div>
              <dt>Replay feed</dt>
              <dd>{replayLabel}</dd>
            </div>
            <div>
              <dt>Learn branch</dt>
              <dd>{learnLabel}</dd>
            </div>
            <div>
              <dt>Model note</dt>
              <dd>{note}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
