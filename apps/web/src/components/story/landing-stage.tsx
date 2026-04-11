"use client";

import { createElement, useEffect } from "react";
import type { TeamProfile } from "@/lib/data";

interface LandingStageProps {
  modelSrc: string;
  posterSrc: string;
  modelTitle: string;
  sizeLabel: string;
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
  replayLabel,
  learnLabel,
  note,
  teamProfile,
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
          poster: posterSrc,
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

        <a className="button landing-stage-v2__cta" href="/cars/current-spec">
          Open live 3D model
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
                <a key={driver.name} className="landing-stage-v2__driver" href={driver.profileUrl} target="_blank" rel="noreferrer">
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
