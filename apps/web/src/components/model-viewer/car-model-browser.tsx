"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CarModelCatalog } from "@/lib/data";
import { focusPoints, getFocusPoint, type FlowOverlayId } from "./focus-points";

interface CarModelBrowserProps {
  catalog: CarModelCatalog;
  latestReplayHref: string;
}

type ModelViewerElement = HTMLElement & {
  cameraOrbit?: string;
  cameraTarget?: string;
};

const CAMERA_PRESETS = [
  {
    id: "studio",
    label: "Studio",
    orbit: "30deg 75deg 2.4m",
    target: "0m 0.25m 0m",
    note: "Balanced orbit for the full chassis silhouette.",
  },
  {
    id: "side",
    label: "Side",
    orbit: "90deg 80deg 2.35m",
    target: "0m 0.2m 0m",
    note: "Best read for wheelbase, body length, and rake.",
  },
  {
    id: "front",
    label: "Front",
    orbit: "0deg 82deg 2.2m",
    target: "0m 0.24m 0m",
    note: "Useful for front wing and suspension framing.",
  },
  {
    id: "top",
    label: "Top",
    orbit: "0deg 8deg 2.7m",
    target: "0m 0.15m 0m",
    note: "Quick read of planform and packaging balance.",
  },
] as const;

const FLOW_OVERLAYS = [
  {
    id: "off",
    label: "Overlay off",
    description: "Keep the stage clean and study the bodywork without any illustrative flow guides.",
  },
  {
    id: "front",
    label: "Front load",
    description: "Shows the first airflow split around the nose and front wing before it reaches the rest of the car.",
  },
  {
    id: "floor",
    label: "Floor channel",
    description: "Highlights the low path under the sidepods and floor where the diffuser story begins.",
  },
  {
    id: "rear",
    label: "Rear wake",
    description: "Emphasizes the exit flow around the rear wing and the wake left behind the car.",
  },
] as const satisfies ReadonlyArray<{
  id: FlowOverlayId;
  label: string;
  description: string;
}>;


function AirflowOverlay({ mode }: { mode: FlowOverlayId }) {
  if (mode === "off") {
    return null;
  }

  if (mode === "front") {
    return (
      <svg className="airflow-overlay" viewBox="0 0 1000 680" aria-hidden="true">
        <path d="M56 238 C188 220, 286 214, 392 240" />
        <path d="M56 304 C196 284, 302 286, 426 318" />
        <path d="M76 374 C214 356, 326 356, 446 384" />
        <path d="M222 232 C246 276, 252 332, 236 386" />
      </svg>
    );
  }

  if (mode === "floor") {
    return (
      <svg className="airflow-overlay" viewBox="0 0 1000 680" aria-hidden="true">
        <path d="M214 446 C324 458, 468 462, 644 444" />
        <path d="M192 500 C334 518, 508 520, 714 498" />
        <path d="M242 560 C376 576, 536 578, 728 560" />
        <path d="M482 404 C506 470, 520 524, 532 580" />
      </svg>
    );
  }

  return (
    <svg className="airflow-overlay" viewBox="0 0 1000 680" aria-hidden="true">
      <path d="M624 232 C736 214, 842 230, 946 284" />
      <path d="M646 302 C752 286, 852 306, 952 358" />
      <path d="M662 372 C770 360, 864 382, 964 438" />
      <path d="M676 438 C782 438, 870 468, 964 528" />
    </svg>
  );
}

function writeSelectionToUrl(season: number, constructorSlug: string, focusId: string | null = null) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("season", String(season));
  url.searchParams.set("constructor", constructorSlug);
  if (focusId) {
    url.searchParams.set("focus", focusId);
  } else {
    url.searchParams.delete("focus");
  }
  window.history.replaceState({}, "", url);
}

export function CarModelBrowser({ catalog, latestReplayHref }: CarModelBrowserProps) {
  const searchParams = useSearchParams();
  const viewerRef = useRef<ModelViewerElement | null>(null);

  const seasons = useMemo(
    () => Array.from(new Set(catalog.models.map((m) => m.season))).sort((a, b) => b - a),
    [catalog],
  );
  const [season, setSeason] = useState<number>(Number(searchParams.get("season")) || seasons[0] || 2025);

  const constructors = useMemo(
    () =>
      catalog.models
        .filter((m) => m.season === season)
        .map((m) => ({ slug: m.constructorSlug, name: m.constructor })),
    [catalog, season],
  );
  const uniqueConstructors = useMemo(() => {
    const seen = new Set<string>();
    return constructors.filter((c) => {
      if (seen.has(c.slug)) return false;
      seen.add(c.slug);
      return true;
    });
  }, [constructors]);

  const [constructorSlug, setConstructorSlug] = useState<string>(
    searchParams.get("constructor") || uniqueConstructors[0]?.slug || "",
  );
  const [activeCameraId, setActiveCameraId] = useState<(typeof CAMERA_PRESETS)[number]["id"]>("studio");
  const [activeFocusId, setActiveFocusId] = useState<(typeof focusPoints)[number]["id"] | null>(
    getFocusPoint(searchParams.get("focus"))?.id ?? null,
  );
  const [activeFlowId, setActiveFlowId] = useState<FlowOverlayId>(
    getFocusPoint(searchParams.get("focus"))?.flowOverlay ?? "off",
  );

  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  useEffect(() => {
    if (!uniqueConstructors.some((entry) => entry.slug === constructorSlug) && uniqueConstructors[0]) {
      setConstructorSlug(uniqueConstructors[0].slug);
      writeSelectionToUrl(season, uniqueConstructors[0].slug, activeFocusId);
    }
  }, [activeFocusId, constructorSlug, season, uniqueConstructors]);

  const activeCamera = CAMERA_PRESETS.find((preset) => preset.id === activeCameraId) || CAMERA_PRESETS[0];
  const activeFocus = getFocusPoint(activeFocusId);
  const currentView = activeFocus
    ? { orbit: activeFocus.orbit, target: activeFocus.target, note: activeFocus.note }
    : activeCamera;
  const activeFlow = FLOW_OVERLAYS.find((overlay) => overlay.id === activeFlowId) || FLOW_OVERLAYS[0];

  function handleFocusChange(nextFocusId: (typeof focusPoints)[number]["id"] | null) {
    if (!nextFocusId) {
      setActiveFocusId(null);
      setActiveFlowId("off");
      writeSelectionToUrl(season, constructorSlug, null);
      return;
    }

    const nextFocus = getFocusPoint(nextFocusId);
    if (!nextFocus) {
      return;
    }

    setActiveFocusId(nextFocus.id);
    setActiveFlowId(nextFocus.flowOverlay);
    writeSelectionToUrl(season, constructorSlug, nextFocus.id);
  }

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    viewerRef.current.cameraOrbit = currentView.orbit;
    viewerRef.current.cameraTarget = currentView.target;
  }, [currentView]);

  const selected = catalog.models.find(
    (m) => m.season === season && m.constructorSlug === constructorSlug,
  );

  if (!selected) {
    return <div className="panel">No models available.</div>;
  }

  return (
    <section className="panel car-viewer-shell">
      <div className="car-viewer-toolbar">
        <div className="control-row">
          <label className="control-field">
            <span>Season</span>
            <select
              value={season}
              onChange={(e) => {
                const next = Number(e.target.value);
                const firstForSeason = catalog.models.find((m) => m.season === next);
                const nextConstructor = firstForSeason?.constructorSlug || "";

                setSeason(next);
                setConstructorSlug(nextConstructor);
                setActiveCameraId("studio");
                handleFocusChange(null);
                if (nextConstructor) {
                  writeSelectionToUrl(next, nextConstructor, null);
                }
              }}
            >
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="control-field">
            <span>Constructor</span>
            <select
              value={constructorSlug}
              onChange={(e) => {
                const nextConstructor = e.target.value;
                setConstructorSlug(nextConstructor);
                setActiveCameraId("studio");
                handleFocusChange(null);
                writeSelectionToUrl(season, nextConstructor, null);
              }}
            >
              {uniqueConstructors.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="camera-preset-row" aria-label="Camera presets">
          {CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`camera-preset${preset.id === activeCameraId ? " camera-preset--active" : ""}`}
              onClick={() => {
                setActiveCameraId(preset.id);
                handleFocusChange(null);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="car-viewer-layout">
        <div className="car-stage-panel">
          <div className="car-stage-panel__header">
            <div>
              <p className="eyebrow">Studio stage</p>
              <h2>{selected.displayName}</h2>
            </div>
            <span className={`car-stage-status${selected.surfaceReady ? " car-stage-status--ready" : ""}`}>
              {selected.surfaceReady ? "Surface ready" : "Preview surface"}
            </span>
          </div>
          <p className="car-stage-panel__lead">{selected.notes}</p>

          <div className="car-viewer-canvas">
            {createElement(
              "model-viewer",
              {
                ref: viewerRef,
                src: selected.file,
                alt: selected.displayName,
                scale: selected.modelScale,
                "camera-controls": true,
                reveal: "auto",
                loading: "eager",
                "camera-orbit": currentView.orbit,
                "camera-target": currentView.target,
                exposure: "1.05",
                "shadow-intensity": "1",
                "touch-action": "pan-y",
                "interaction-prompt": "auto",
                "environment-image": "neutral",
                style: {
                  width: "100%",
                  height: "min(68vh, 680px)",
                  background: "radial-gradient(circle at top, rgba(255,255,255,0.98), rgba(234,240,248,0.9) 58%, rgba(217,225,236,0.98))",
                  borderRadius: "22px",
                },
              },
              focusPoints.map((point) => {
                const isActive = point.id === activeFocusId;

                return createElement(
                  "button",
                  {
                    key: point.id,
                    slot: `hotspot-${point.id}`,
                    type: "button",
                    className: `car-model-hotspot${isActive ? " car-model-hotspot--active" : ""}`,
                    "data-position": point.hotspotPosition,
                    "data-normal": point.hotspotNormal,
                    "data-visibility-attribute": "visible",
                    onClick: () => handleFocusChange(isActive ? null : point.id),
                    "aria-label": point.title,
                  },
                  point.shortLabel,
                );
              }),
            )}

            <AirflowOverlay mode={activeFlowId} />

            {activeFlowId !== "off" ? (
              <div className="airflow-overlay-badge">Illustrative airflow overlay</div>
            ) : null}
          </div>

          <p className="car-viewer-meta">
            <span>{currentView.note}</span>
            <span>{selected.sizeLabel}</span>
          </p>
        </div>

        <aside className="car-inspector">
          <article className="car-inspector-card">
            <p className="eyebrow">Focus point</p>
            <h3>{activeFocus ? activeFocus.title : "Select a hotspot or focus list"}</h3>
            <p className="car-inspector-copy">
              {activeFocus
                ? activeFocus.summary
                : "Use the stage hotspots or the list below to snap the camera toward one subsystem and branch into the matching learn module."}
            </p>
            <div className="car-focus-actions">
              {activeFocus ? (
                <>
                  <a className="button button--ghost" href={activeFocus.learnHref}>{activeFocus.learnLabel}</a>
                  <a className="button button--secondary" href={`${latestReplayHref}?focus=${activeFocus.id}`}>
                    Open focus replay
                  </a>
                </>
              ) : (
                <a className="button button--ghost" href="/learn/car">Open car primer</a>
              )}
              <button
                type="button"
                className="camera-preset"
                onClick={() => handleFocusChange(null)}
              >
                Return to studio
              </button>
            </div>
            <div className="car-focus-list">
              {focusPoints.map((point) => (
                <button
                  key={point.id}
                  type="button"
                  className={`car-focus-item${point.id === activeFocusId ? " car-focus-item--active" : ""}`}
                  onClick={() => handleFocusChange(point.id === activeFocusId ? null : point.id)}
                >
                  <strong>{point.title}</strong>
                  <span>{point.learnLabel}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="car-inspector-card">
            <p className="eyebrow">Airflow layer</p>
            <h3>{activeFlow.label}</h3>
            <p className="car-inspector-copy">{activeFlow.description}</p>
            <div className="flow-overlay-controls">
              {FLOW_OVERLAYS.map((overlay) => (
                <button
                  key={overlay.id}
                  type="button"
                  className={`flow-overlay-toggle${overlay.id === activeFlowId ? " flow-overlay-toggle--active" : ""}`}
                  onClick={() => setActiveFlowId(overlay.id)}
                >
                  {overlay.label}
                </button>
              ))}
            </div>
            <p className="car-inspector-note">
              Visual guide only. This overlay is for explanation and orientation, not CFD or race-team analysis.
            </p>
          </article>

          <article className="car-inspector-card">
            <p className="eyebrow">Current model</p>
            <div className="car-model-facts">
              <div>
                <span>Season</span>
                <strong>{selected.season}</strong>
              </div>
              <div>
                <span>Constructor</span>
                <strong>{selected.constructor}</strong>
              </div>
              <div>
                <span>Asset</span>
                <strong>{selected.sizeLabel}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{selected.surfaceReady ? "Ready for model-led stories" : "Good for reference viewing"}</strong>
              </div>
            </div>
          </article>

          <article className="car-inspector-card">
            <p className="eyebrow">Branch from model</p>
            <div className="car-model-quicklinks">
              <a href="/learn/car">
                <strong>Open car primer</strong>
                <span>Start with the chassis, packaging, brakes, and tyre contact patch.</span>
              </a>
              <a href="/learn/aero">
                <strong>Continue to aero</strong>
                <span>Jump from the physical car into airflow, floor behavior, and rear-wing tradeoffs.</span>
              </a>
              <a href={latestReplayHref}>
                <strong>Watch latest replay</strong>
                <span>Carry the same engineering story into a real session pack and track position view.</span>
              </a>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
