"use client";

import { createElement, useEffect, useState } from "react";
import type { TeamProfile } from "@/lib/data";
import { ensureModelViewerLoaded } from "@/lib/model-viewer-loader";

interface LandingStageProps {
  modelSrc: string;
  posterSrc: string;
  modelTitle: string;
  sizeLabel: string;
  modelScale?: string;
  heroCamera?: {
    orbit: string;
    target: string;
    fieldOfView?: string;
    minOrbit?: string;
    maxOrbit?: string;
  };
  replayLabel: string;
  learnLabel: string;
  note: string;
  teamProfile?: TeamProfile;
}

export function LandingStage({
  modelSrc,
  posterSrc,
  modelTitle,
  sizeLabel,
  modelScale,
  heroCamera,
  replayLabel,
  learnLabel,
  note,
  teamProfile,
}: LandingStageProps) {
  const [viewerState, setViewerState] = useState<"poster" | "loading" | "ready" | "error">("poster");
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReduceMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  function loadViewer() {
    setViewerState("loading");
    ensureModelViewerLoaded()
      .then(() => setViewerState("ready"))
      .catch(() => setViewerState("error"));
  }

  return (
    <div className="landing-stage-v2">
      <div className="landing-stage-v2__frame">
        <div className="landing-stage-v2__beam landing-stage-v2__beam--top" />
        <div className="landing-stage-v2__beam landing-stage-v2__beam--mid" />
        <div className="landing-stage-v2__beam landing-stage-v2__beam--bottom" />

        {viewerState === "ready" ? createElement("model-viewer", {
          className: "landing-stage-v2__viewer",
          src: modelSrc,
          poster: posterSrc,
          alt: modelTitle,
          scale: modelScale,
          reveal: "auto",
          loading: "lazy",
          "camera-controls": true,
          "auto-rotate": reduceMotion ? undefined : true,
          "auto-rotate-delay": 0,
          "rotation-per-second": "12deg",
          "camera-orbit": heroCamera?.orbit || "20deg 76deg 1.45m",
          "camera-target": heroCamera?.target || "0m 0.18m 0m",
          "field-of-view": heroCamera?.fieldOfView || "24deg",
          "min-camera-orbit": heroCamera?.minOrbit || "auto auto 1m",
          "max-camera-orbit": heroCamera?.maxOrbit || "auto auto 2.2m",
          exposure: "1.08",
          "shadow-intensity": "1",
          "touch-action": "pan-y",
          "interaction-prompt": "none",
          "environment-image": "neutral",
        }) : (
          <div className="landing-stage-v2__poster">
            <img src={posterSrc} alt={`${modelTitle} preview`} />
            <button type="button" onClick={loadViewer} disabled={viewerState === "loading"}>
              {viewerState === "loading" ? "Loading 3D..." : viewerState === "error" ? "Retry 3D model" : "Load interactive 3D"}
            </button>
          </div>
        )}

        <a className="button landing-stage-v2__cta" href="/cars/current-spec">
          Open modelview
        </a>

        <div className="landing-stage-v2__panel landing-stage-v2__panel--status">
          <span>Hero GLB</span>
          <strong>{modelTitle}</strong>
          <p>{sizeLabel}</p>
        </div>

        <div className="landing-stage-v2__panel landing-stage-v2__panel--telemetry">
          <span>{teamProfile?.displayName || "Live aero map"}</span>
          {teamProfile ? (
            <div className="landing-stage-v2__team-header">
              <img src={teamProfile.logo} alt={`${teamProfile.displayName} logo`} />
              <div>
                <strong>{teamProfile.fullTeamName}</strong>
                <p>{teamProfile.base}</p>
              </div>
            </div>
          ) : null}
          <dl>
            <div>
              <dt>Replay feed</dt>
              <dd>{replayLabel}</dd>
            </div>
            <div>
              <dt>Team chief</dt>
              <dd>{teamProfile?.teamChief || learnLabel}</dd>
            </div>
            <div>
              <dt>Technical chief</dt>
              <dd>{teamProfile?.technicalChief || note}</dd>
            </div>
          </dl>
          {teamProfile ? (
            <div className="landing-stage-v2__drivers">
              {teamProfile.drivers.map((driver) => (
                <a key={driver.name} className="landing-stage-v2__driver" href={driver.profileUrl} target="_blank" rel="noopener noreferrer">
                  <img src={driver.image} alt={driver.name} />
                  <div>
                    <strong>{driver.name}</strong>
                    <span>{driver.role}</span>
                  </div>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
