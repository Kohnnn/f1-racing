"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CarModelCatalog } from "@/lib/data";
import { focusPoints, getFocusPoint } from "./focus-points";
import { CanvasWindTunnel } from "@/components/wind/canvas-wind-tunnel";

/**
 * Renders an AI-generated exploded technical illustration of the car
 * matched to the current constructor + season slug. Image lives at
 * `/exploded-views/<season>/<constructor>.png` (committed asset, generated
 * via 9Router cx/gpt-5.5-image). Falls back gracefully when missing.
 */
function ExplodedViewLayer({
  constructorSlug,
  season,
  expanded,
  onToggle,
}: {
  constructorSlug: string;
  season: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const url = `/exploded-views/${season}/${constructorSlug}.png`;
  useEffect(() => {
    let cancelled = false;
    setAvailable(null);
    fetch(url, { method: "HEAD" })
      .then((response) => {
        if (cancelled) return;
        setAvailable(response.ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (available === false) {
    return (
      <div className="car-viewer-inspect-overlay__hint">
        Exploded view is not available for this constructor yet. Try another constructor or keep using hotspot inspect mode.
      </div>
    );
  }
  if (!available) {
    return null;
  }
  return (
    <figure
      className={`car-viewer-inspect-overlay__exploded${expanded ? " car-viewer-inspect-overlay__exploded--expanded" : ""}`}
    >
      <button
        type="button"
        className="car-viewer-inspect-overlay__exploded-toggle"
        onClick={onToggle}
        aria-label={expanded ? "Collapse exploded view" : "Expand exploded view"}
      >
        {expanded ? "Collapse" : "Expand"}
      </button>
      <img src={url} alt="Exploded technical view" loading="lazy" />
      <figcaption>Exploded view · subsystems pulled apart along assembly axes</figcaption>
    </figure>
  );
}

interface CarModelBrowserProps {
  catalog: CarModelCatalog;
  latestReplayHref: string;
}

type ModelViewerElement = HTMLElement & {
  cameraOrbit?: string;
  cameraTarget?: string;
  fieldOfView?: string;
  resetTurntableRotation?: () => void;
  jumpCameraToGoal?: () => void;
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
  const [modelReady, setModelReady] = useState(false);

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
  const [interactionMode, setInteractionMode] = useState<"orbit" | "inspect">("orbit");
  const [compareSlug, setCompareSlug] = useState<string | null>(null);
  const [explodedExpanded, setExplodedExpanded] = useState<boolean>(false);
  const [studioQuality, setStudioQuality] = useState<"clean" | "studio">("studio");
  const [zoomHint, setZoomHint] = useState<string>("");

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

  function handleFocusChange(nextFocusId: (typeof focusPoints)[number]["id"] | null) {
    if (!nextFocusId) {
      setActiveFocusId(null);
      writeSelectionToUrl(season, constructorSlug, null);
      return;
    }

    const nextFocus = getFocusPoint(nextFocusId);
    if (!nextFocus) {
      return;
    }

    setActiveFocusId(nextFocus.id);
    writeSelectionToUrl(season, constructorSlug, nextFocus.id);
  }

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    viewerRef.current.cameraOrbit = currentView.orbit;
    viewerRef.current.cameraTarget = currentView.target;
  }, [currentView]);

  // Keyboard nudges for camera control: +/- zoom, arrows orbit, R reset.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      // Skip when focus is in an input.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) {
        return;
      }
      const orbit = viewer.cameraOrbit ?? currentView.orbit;
      const parts = orbit.split(/\s+/);
      if (parts.length < 3) return;
      const theta = parseFloat(parts[0]);
      const phi = parseFloat(parts[1]);
      const radiusMatch = parts[2].match(/([\d.]+)([a-zA-Z%]+)/);
      if (!radiusMatch) return;
      const radius = parseFloat(radiusMatch[1]);
      const unit = radiusMatch[2];
      let nextTheta = theta;
      let nextPhi = phi;
      let nextRadius = radius;
      let handled = false;
      switch (event.key) {
        case "ArrowLeft":
          nextTheta -= 8;
          handled = true;
          break;
        case "ArrowRight":
          nextTheta += 8;
          handled = true;
          break;
        case "ArrowUp":
          nextPhi = Math.max(5, nextPhi - 5);
          handled = true;
          break;
        case "ArrowDown":
          nextPhi = Math.min(170, nextPhi + 5);
          handled = true;
          break;
        case "+":
        case "=":
          nextRadius = Math.max(0.6, nextRadius - 0.18);
          setZoomHint(`zoom ${nextRadius.toFixed(2)}${unit}`);
          handled = true;
          break;
        case "-":
        case "_":
          nextRadius = Math.min(8, nextRadius + 0.18);
          setZoomHint(`zoom ${nextRadius.toFixed(2)}${unit}`);
          handled = true;
          break;
        case "r":
        case "R":
          handleFocusChange(null);
          setActiveCameraId("studio");
          handled = true;
          break;
        default:
          break;
      }
      if (handled) {
        event.preventDefault();
        viewer.cameraOrbit = `${nextTheta}deg ${nextPhi}deg ${nextRadius}${unit}`;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentView.orbit]);

  // Clear zoom hint after a short delay.
  useEffect(() => {
    if (!zoomHint) return;
    const t = window.setTimeout(() => setZoomHint(""), 1400);
    return () => window.clearTimeout(t);
  }, [zoomHint]);

  function handleZoomButton(delta: number) {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const orbit = viewer.cameraOrbit ?? currentView.orbit;
    const parts = orbit.split(/\s+/);
    if (parts.length < 3) return;
    const radiusMatch = parts[2].match(/([\d.]+)([a-zA-Z%]+)/);
    if (!radiusMatch) return;
    const radius = parseFloat(radiusMatch[1]);
    const unit = radiusMatch[2];
    const nextRadius = Math.max(0.6, Math.min(8, radius + delta));
    viewer.cameraOrbit = `${parts[0]} ${parts[1]} ${nextRadius}${unit}`;
    setZoomHint(`zoom ${nextRadius.toFixed(2)}${unit}`);
  }

  const selected = catalog.models.find(
    (m) => m.season === season && m.constructorSlug === constructorSlug,
  );

  useEffect(() => {
    setModelReady(false);
  }, [selected?.id]);

  if (!selected) {
    return <div className="panel">No models available.</div>;
  }

  const studioAttrs = studioQuality === "studio"
    ? { exposure: "1.05", "shadow-intensity": "1.4", "shadow-softness": "0.7", "tone-mapping": "commerce" }
    : { exposure: "1.0", "shadow-intensity": "1", "shadow-softness": "0.85", "tone-mapping": "neutral" };

  return (
    <section className="panel car-viewer-shell">
      <div className="car-viewer-toolbar">
        <div className="control-row">
          {seasons.length > 1 ? (
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
          ) : null}
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
          <span className="camera-preset-row__divider" aria-hidden="true" />
          <div className="camera-preset-row__group" role="tablist" aria-label="Interaction mode">
            <button
              type="button"
              role="tab"
              aria-selected={interactionMode === "orbit"}
              className={`camera-preset${interactionMode === "orbit" ? " camera-preset--active" : ""}`}
              onClick={() => setInteractionMode("orbit")}
              title="Drag to orbit, click to set focus"
            >
              Orbit
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={interactionMode === "inspect"}
              className={`camera-preset${interactionMode === "inspect" ? " camera-preset--active" : ""}`}
              onClick={() => setInteractionMode("inspect")}
              title="Click hotspots without orbiting"
            >
              Inspect
            </button>
          </div>
          <span className="camera-preset-row__divider" aria-hidden="true" />
          <div className="camera-preset-row__group" role="tablist" aria-label="Studio quality">
            <button
              type="button"
              role="tab"
              aria-selected={studioQuality === "clean"}
              className={`camera-preset${studioQuality === "clean" ? " camera-preset--active" : ""}`}
              onClick={() => setStudioQuality("clean")}
              title="Neutral lighting"
            >
              Clean
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioQuality === "studio"}
              className={`camera-preset${studioQuality === "studio" ? " camera-preset--active" : ""}`}
              onClick={() => setStudioQuality("studio")}
              title="Commerce-style HDR with softer shadows"
            >
              Studio
            </button>
          </div>
          <span className="camera-preset-row__divider" aria-hidden="true" />
          <button
            type="button"
            className={`camera-preset${compareSlug ? " camera-preset--active" : ""}`}
            onClick={() => {
              if (compareSlug) {
                setCompareSlug(null);
                return;
              }
              const candidate = uniqueConstructors.find((entry) => entry.slug !== constructorSlug);
              if (candidate) setCompareSlug(candidate.slug);
            }}
          >
            {compareSlug ? "Hide compare" : "Compare side-by-side"}
          </button>
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

          <div
            className={`car-viewer-canvas${compareSlug ? " car-viewer-canvas--compare" : ""} car-viewer-canvas--mode-${interactionMode}`}
          >
            {createElement(
              "model-viewer",
              {
                key: selected.id,
                ref: viewerRef,
                src: selected.file,
                alt: selected.displayName,
                scale: selected.modelScale,
                "camera-controls": interactionMode === "orbit",
                "disable-pan": interactionMode === "inspect",
                reveal: "auto",
                loading: "eager",
                "camera-orbit": currentView.orbit,
                "camera-target": currentView.target,
                "min-camera-orbit": "auto auto 0.6m",
                "max-camera-orbit": "auto auto 6m",
                "interpolation-decay": "100",
                exposure: studioAttrs.exposure,
                "shadow-intensity": studioAttrs["shadow-intensity"],
                "shadow-softness": studioAttrs["shadow-softness"],
                "tone-mapping": studioAttrs["tone-mapping"],
                "touch-action": interactionMode === "orbit" ? "pan-y" : "none",
                "interaction-prompt": "auto",
                "interaction-prompt-style": "basic",
                "environment-image": "neutral",
                onLoad: () => setModelReady(true),
                onError: () => setModelReady(true),
                style: {
                  width: "100%",
                  height: compareSlug ? "min(60vh, 600px)" : "min(74vh, 760px)",
                  background:
                    "radial-gradient(circle at top, rgba(20,28,42,0.95), rgba(8,11,18,0.96) 58%, rgba(4,6,12,1))",
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
                    className: `car-model-hotspot car-model-hotspot--${point.id}${isActive ? " car-model-hotspot--active" : ""}${interactionMode === "inspect" ? " car-model-hotspot--inspect" : ""}`,
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

            {/* First-load drag hint that fades after a couple of seconds. */}
            {modelReady ? (
              <div className="car-viewer-drag-hint" aria-hidden="true">
                Drag to orbit · scroll to zoom · R resets · arrows nudge
              </div>
            ) : null}

            {/* Floating zoom controls. */}
            {modelReady ? (
              <div className="car-viewer-zoom-controls" aria-hidden="true">
                <button type="button" onClick={() => handleZoomButton(-0.18)} aria-label="Zoom in">+</button>
                <button type="button" onClick={() => handleZoomButton(0.18)} aria-label="Zoom out">-</button>
                <button type="button" onClick={() => { handleFocusChange(null); setActiveCameraId("studio"); }} aria-label="Reset view" title="Reset (R)">R</button>
                {zoomHint ? <span className="car-viewer-zoom-controls__hint">{zoomHint}</span> : null}
              </div>
            ) : null}

            {/* Exploded-view annotation pin overlay shown only in Inspect mode. */}
            {interactionMode === "inspect" && modelReady ? (
              <div
                className={`car-viewer-inspect-overlay${explodedExpanded ? " car-viewer-inspect-overlay--expanded" : ""}`}
              >
                <p className="car-viewer-inspect-overlay__title">Inspect mode</p>
                <p>Click any hotspot to lock the camera. Orbit drag is disabled so the click lands cleanly.</p>
                <ExplodedViewLayer
                  constructorSlug={selected.constructorSlug}
                  season={selected.season}
                  expanded={explodedExpanded}
                  onToggle={() => setExplodedExpanded((prev) => !prev)}
                />
              </div>
            ) : null}

            {!modelReady ? (
              <div className="car-viewer-loading" role="status" aria-live="polite">
                <span className="car-viewer-loading__spinner" aria-hidden="true" />
                Loading {selected.displayName} · {selected.sizeLabel}
              </div>
            ) : null}

            {compareSlug ? (
              <div className="car-viewer-canvas__compare-pane">
                <div className="car-viewer-canvas__compare-toolbar">
                  <span>Compare with</span>
                  <select
                    value={compareSlug}
                    onChange={(event) => setCompareSlug(event.target.value)}
                    aria-label="Compare constructor"
                  >
                    {uniqueConstructors
                      .filter((entry) => entry.slug !== constructorSlug)
                      .map((entry) => (
                        <option key={entry.slug} value={entry.slug}>{entry.name}</option>
                      ))}
                  </select>
                </div>
                {(() => {
                  const compareModel = catalog.models.find(
                    (m) => m.season === season && m.constructorSlug === compareSlug,
                  );
                  if (!compareModel) return null;
                  return createElement(
                    "model-viewer",
                    {
                      key: `compare-${compareModel.id}`,
                      src: compareModel.file,
                      alt: compareModel.displayName,
                      scale: compareModel.modelScale,
                      "camera-controls": interactionMode === "orbit",
                      "disable-pan": interactionMode === "inspect",
                      reveal: "auto",
                      loading: "lazy",
                      "camera-orbit": currentView.orbit,
                      "camera-target": currentView.target,
                      "min-camera-orbit": "auto auto 0.6m",
                      "max-camera-orbit": "auto auto 6m",
                      exposure: studioAttrs.exposure,
                      "shadow-intensity": studioAttrs["shadow-intensity"],
                      "shadow-softness": studioAttrs["shadow-softness"],
                      "tone-mapping": studioAttrs["tone-mapping"],
                      "touch-action": interactionMode === "orbit" ? "pan-y" : "none",
                      "environment-image": "neutral",
                      style: {
                        width: "100%",
                        height: "min(58vh, 560px)",
                        background:
                          "radial-gradient(circle at top, rgba(20,28,42,0.95), rgba(8,11,18,0.96) 58%, rgba(4,6,12,1))",
                        borderRadius: "22px",
                      },
                    },
                    focusPoints.map((point) => {
                      const isActive = point.id === activeFocusId;
                      return createElement(
                        "button",
                        {
                          key: `compare-${point.id}`,
                          slot: `hotspot-${point.id}`,
                          type: "button",
                          className: `car-model-hotspot car-model-hotspot--${point.id}${isActive ? " car-model-hotspot--active" : ""}${interactionMode === "inspect" ? " car-model-hotspot--inspect" : ""}`,
                          "data-position": point.hotspotPosition,
                          "data-normal": point.hotspotNormal,
                          "data-visibility-attribute": "visible",
                          onClick: () => handleFocusChange(isActive ? null : point.id),
                          "aria-label": `${compareModel.displayName} - ${point.title}`,
                        },
                        point.shortLabel,
                      );
                    }),
                  );
                })()}
              </div>
            ) : null}
          </div>

          <p className="car-viewer-meta">
            <span>{currentView.note}</span>
            <span>{selected.sizeLabel}</span>
          </p>
        </div>

        <aside className="car-inspector">
          <article className="car-inspector-card">
            <p className="eyebrow">Focus</p>
            <h3>{activeFocus ? activeFocus.title : "Hotspots"}</h3>
            {activeFocus ? <p className="car-inspector-copy">{activeFocus.summary}</p> : null}
            {activeFocus ? (
              <div className="car-focus-actions">
                <a className="button button--ghost" href={activeFocus.learnHref}>{activeFocus.learnLabel}</a>
                <a className="button button--secondary" href={`${latestReplayHref}?focus=${activeFocus.id}`}>
                  Open focus replay
                </a>
                <button
                  type="button"
                  className="camera-preset"
                  onClick={() => handleFocusChange(null)}
                >
                  Reset
                </button>
              </div>
            ) : null}
            <div className="car-focus-list">
              {focusPoints.map((point) => (
                <button
                  key={point.id}
                  type="button"
                  className={`car-focus-item${point.id === activeFocusId ? " car-focus-item--active" : ""}`}
                  onClick={() => handleFocusChange(point.id === activeFocusId ? null : point.id)}
                >
                  <strong>{point.shortLabel}</strong>
                  <span>{point.title}</span>
                </button>
              ))}
            </div>
          </article>

          {activeFocus ? (
            <article className="car-inspector-card">
              <p className="eyebrow">Airflow story</p>
              <h3>{activeFocus.flowSummary.title}</h3>
              <p className="car-inspector-copy">{activeFocus.flowSummary.body}</p>
              <p className="car-inspector-note">
                Static reference text. The wind tunnel below runs a real 2D solver.
              </p>
            </article>
          ) : null}

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

      <div className="car-wind-tunnel-host">
        <CanvasWindTunnel modelTitle={selected.displayName} constructorSlug={selected.constructorSlug} />
      </div>
    </section>
  );
}
