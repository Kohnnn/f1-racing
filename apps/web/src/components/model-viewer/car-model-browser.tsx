"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CarModelCatalog, WindOverlaySchemaExample } from "@/lib/data";

interface CarModelBrowserProps {
  catalog: CarModelCatalog;
  overlaySchema: WindOverlaySchemaExample;
}

interface HotspotConfig {
  id: string;
  label: string;
  position: string;
  normal: string;
  description: string;
  cameraOrbit?: string;
  cameraTarget?: string;
}

interface CameraPreset {
  id: string;
  label: string;
  orbit: string;
  target?: string;
}

type ModelViewerElement = HTMLElement & {
  cameraOrbit?: string;
  cameraTarget?: string;
};

const MODEL_CONFIGS: Record<string, { presets: CameraPreset[]; hotspots: HotspotConfig[] }> = {
  "mclaren-2025-mcl39": {
    presets: [
      { id: "iso", label: "Isometric", orbit: "35deg 70deg 2.6m", target: "0m 0.3m 0m" },
      { id: "front", label: "Front aero", orbit: "0deg 78deg 1.6m", target: "0m 0.24m 0.76m" },
      { id: "side", label: "Side profile", orbit: "90deg 78deg 2.2m", target: "0m 0.25m 0m" },
      { id: "rear", label: "Rear wing", orbit: "180deg 76deg 1.7m", target: "0m 0.45m -0.92m" },
      { id: "floor", label: "Floor", orbit: "40deg 102deg 1.7m", target: "0m 0.02m 0.08m" },
    ],
    hotspots: [
      {
        id: "front-wing",
        label: "Front wing",
        position: "0m 0.18m 0.88m",
        normal: "0 1 0",
        description: "The front wing is the first big airflow manager. Use this hotspot when explaining front load, wake sensitivity, and floor feed quality.",
        cameraOrbit: "0deg 78deg 1.55m",
        cameraTarget: "0m 0.22m 0.82m",
      },
      {
        id: "sidepod",
        label: "Sidepod inlet",
        position: "0.36m 0.34m 0.12m",
        normal: "1 0 0",
        description: "Use this for cooling, packaging, and the body-side flow story that feeds the rear of the car.",
        cameraOrbit: "76deg 74deg 1.8m",
        cameraTarget: "0.28m 0.34m 0.08m",
      },
      {
        id: "floor-edge",
        label: "Floor edge",
        position: "0.28m 0.03m 0.02m",
        normal: "1 0 0",
        description: "Use this hotspot for ground-effect, edge sealing, and ride-height sensitivity explanations.",
        cameraOrbit: "46deg 101deg 1.55m",
        cameraTarget: "0.18m 0.02m 0.02m",
      },
      {
        id: "rear-wing",
        label: "Rear wing",
        position: "0m 0.72m -0.95m",
        normal: "0 1 0",
        description: "Use this for rear load, drag, and DRS discussions.",
        cameraOrbit: "180deg 74deg 1.55m",
        cameraTarget: "0m 0.56m -0.9m",
      },
    ],
  },
  "apx-gp-2025-apx01": {
    presets: [
      { id: "iso", label: "Isometric", orbit: "35deg 70deg 2.4m", target: "0m 0.28m 0m" },
      { id: "front", label: "Front aero", orbit: "0deg 78deg 1.55m", target: "0m 0.22m 0.74m" },
      { id: "side", label: "Side profile", orbit: "90deg 78deg 2m", target: "0m 0.24m 0m" },
      { id: "rear", label: "Rear wing", orbit: "180deg 76deg 1.6m", target: "0m 0.45m -0.9m" },
    ],
    hotspots: [
      {
        id: "front-wing",
        label: "Front wing",
        position: "0m 0.18m 0.84m",
        normal: "0 1 0",
        description: "Use this for front-end authority and wake sensitivity on the APX GP car.",
        cameraOrbit: "0deg 78deg 1.5m",
        cameraTarget: "0m 0.2m 0.78m",
      },
      {
        id: "engine-cover",
        label: "Engine cover",
        position: "0m 0.42m -0.18m",
        normal: "0 1 0",
        description: "Use this to frame power-unit packaging and cooling discussions for the APX GP model.",
        cameraOrbit: "180deg 72deg 1.8m",
        cameraTarget: "0m 0.38m -0.22m",
      },
      {
        id: "rear-wing",
        label: "Rear wing",
        position: "0m 0.68m -0.92m",
        normal: "0 1 0",
        description: "Use this for rear support and DRS explanation on the APX GP model.",
        cameraOrbit: "180deg 74deg 1.55m",
        cameraTarget: "0m 0.56m -0.88m",
      },
    ],
  },
};

export function CarModelBrowser({ catalog, overlaySchema }: CarModelBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const seasons = useMemo(() => Array.from(new Set(catalog.models.map((model) => model.season))).sort(), [catalog]);
  const initialSeason = Number(searchParams.get("season") || seasons[0] || 2025);
  const [season, setSeason] = useState<number>(Number.isFinite(initialSeason) ? initialSeason : 2025);
  const constructors = useMemo(
    () => Array.from(new Set(catalog.models.filter((model) => model.season === season).map((model) => model.constructorSlug))),
    [catalog, season],
  );
  const initialConstructor = searchParams.get("constructor") || constructors[0] || catalog.models[0]?.constructorSlug || "";
  const [constructorSlug, setConstructorSlug] = useState<string>(initialConstructor);
  const viewerRef = useRef<ModelViewerElement | null>(null);

  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  useEffect(() => {
    if (!constructors.includes(constructorSlug)) {
      setConstructorSlug(constructors[0] ?? "");
    }
  }, [constructors, constructorSlug]);

  const filtered = catalog.models.filter((model) => model.season === season && model.constructorSlug === constructorSlug);
  const selected = filtered[0] ?? catalog.models[0];
  const modelConfig = selected ? MODEL_CONFIGS[selected.id] : undefined;
  const focusFromQuery = searchParams.get("focus") || modelConfig?.hotspots[0]?.id || "";
  const [activeHotspot, setActiveHotspot] = useState<string>(focusFromQuery);

  function updateQuery(next: {
    season?: number;
    constructorSlug?: string;
    focus?: string;
    camera?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", String(next.season ?? season));
    params.set("constructor", next.constructorSlug ?? constructorSlug);

    if (next.focus) {
      params.set("focus", next.focus);
    } else {
      params.delete("focus");
    }

    if (next.camera) {
      params.set("camera", next.camera);
    } else {
      params.delete("camera");
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    const requestedSeason = Number(searchParams.get("season") || seasons[0] || 2025);
    if (Number.isFinite(requestedSeason) && requestedSeason !== season) {
      setSeason(requestedSeason);
    }
  }, [searchParams, seasons, season]);

  useEffect(() => {
    const requestedConstructor = searchParams.get("constructor");
    if (requestedConstructor && constructors.includes(requestedConstructor) && requestedConstructor !== constructorSlug) {
      setConstructorSlug(requestedConstructor);
    }
  }, [searchParams, constructors, constructorSlug]);

  useEffect(() => {
    if (modelConfig?.hotspots.length && !modelConfig.hotspots.some((item) => item.id === activeHotspot)) {
      setActiveHotspot(modelConfig.hotspots[0].id);
    }
  }, [modelConfig, activeHotspot]);

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (focus && modelConfig?.hotspots.some((item) => item.id === focus) && focus !== activeHotspot) {
      setActiveHotspot(focus);
    }
  }, [searchParams, modelConfig, activeHotspot]);

  function applyCameraPreset(orbit?: string, target?: string) {
    if (!viewerRef.current) {
      return;
    }

    if (orbit) {
      viewerRef.current.setAttribute("camera-orbit", orbit);
    }
    if (target) {
      viewerRef.current.setAttribute("camera-target", target);
    }
  }

  useEffect(() => {
    const presetId = searchParams.get("camera");
    if (!presetId || !modelConfig) {
      return;
    }
    const preset = modelConfig.presets.find((item) => item.id === presetId);
    if (preset) {
      applyCameraPreset(preset.orbit, preset.target);
    }
  }, [searchParams, modelConfig]);

  if (!selected) {
    return <div className="panel">No models available yet.</div>;
  }

  const activeHotspotConfig = modelConfig?.hotspots.find((item) => item.id === activeHotspot) ?? modelConfig?.hotspots[0];
  const matchedOverlay = overlaySchema.modelId === selected.id ? overlaySchema : null;

  const hotspotChildren = (modelConfig?.hotspots ?? []).map((hotspot) =>
    createElement("button", {
      key: hotspot.id,
      slot: `hotspot-${hotspot.id}`,
      className: "car-browser__hotspot",
      "data-position": hotspot.position,
      "data-normal": hotspot.normal,
      title: hotspot.label,
      onClick: () => {
        setActiveHotspot(hotspot.id);
        applyCameraPreset(hotspot.cameraOrbit, hotspot.cameraTarget);
        updateQuery({ focus: hotspot.id, camera: undefined });
      },
    }),
  );

  const modelViewerProps = {
    ref: viewerRef,
    src: selected.file,
    poster: selected.poster,
    alt: selected.displayName,
    exposure: "1.05",
    "shadow-intensity": "1",
    "camera-controls": true,
    "camera-orbit": modelConfig?.presets[0]?.orbit,
    "camera-target": modelConfig?.presets[0]?.target,
    "touch-action": "pan-y",
    "interaction-prompt": "auto",
    "environment-image": "neutral",
    style: {
      width: "100%",
      height: "min(70vh, 720px)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.86), rgba(240,232,222,0.94))",
      borderRadius: "22px",
    },
  };

  return (
    <div className="page-stack">
      <section className="panel car-browser-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Model surface</p>
            <h2>{selected.displayName}</h2>
          </div>
        </div>
        <div className="control-row control-row--tight">
          <label className="control-field">
            <span>Season</span>
            <select
              value={season}
              onChange={(event) => {
                const nextSeason = Number(event.target.value);
                setSeason(nextSeason);
                updateQuery({ season: nextSeason, constructorSlug, focus: undefined, camera: undefined });
              }}
            >
              {seasons.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="control-field">
            <span>Constructor</span>
            <select
              value={constructorSlug}
              onChange={(event) => {
                const next = event.target.value;
                setConstructorSlug(next);
                updateQuery({ season, constructorSlug: next, focus: undefined, camera: undefined });
              }}
            >
              {constructors.map((value) => {
                const model = catalog.models.find((item) => item.constructorSlug === value && item.season === season);
                return (
                  <option value={value} key={value}>
                    {model?.constructor ?? value}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        <div className="camera-preset-row">
          {(modelConfig?.presets ?? []).map((preset) => (
            <button
              className="camera-preset-button"
              key={preset.id}
              onClick={() => {
                applyCameraPreset(preset.orbit, preset.target);
                updateQuery({ season, constructorSlug, focus: activeHotspot, camera: preset.id });
              }}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
        {createElement("model-viewer", modelViewerProps, ...hotspotChildren)}
      </section>

      <section className="panel-grid panel-grid--two">
        <article className="panel surface-card">
          <p className="eyebrow">Asset state</p>
          <h3>{selected.sizeLabel}</h3>
          <p>{selected.notes}</p>
        </article>
        <article className="panel surface-card">
          <p className="eyebrow">CFD readiness</p>
          <h3>{selected.surfaceReady ? "Surface-ready" : "Geometry only"}</h3>
          <p>
            {selected.surfaceReady
              ? "This model is ready for surface-linked overlays and hotspot probes."
              : "This model is already viewable, but CFD overlays still need a mapping layer or a matching simulation mesh."}
          </p>
        </article>
      </section>

      {matchedOverlay ? (
        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Baked overlay prototype</p>
              <h2>{matchedOverlay.scenarioId}</h2>
            </div>
          </div>
          <div className="panel-grid panel-grid--two">
            <article className="panel panel--nested">
              <p className="eyebrow">Binding</p>
              <h3>{matchedOverlay.meshBinding.renderMeshId}</h3>
              <p>
                Mapping mode: {matchedOverlay.meshBinding.mappingMode}. Triangle count: {matchedOverlay.meshBinding.triangleCount.toLocaleString()}.
              </p>
            </article>
            <article className="panel panel--nested">
              <p className="eyebrow">Color scale</p>
              <h3>
                {matchedOverlay.metric.toUpperCase()} ({matchedOverlay.units})
              </h3>
              <p>
                Min {matchedOverlay.colorScale.min} · Max {matchedOverlay.colorScale.max}
              </p>
              <div className="overlay-palette">
                {matchedOverlay.colorScale.palette.map((color) => (
                  <span key={color} className="overlay-palette__swatch" style={{ background: color }} />
                ))}
              </div>
            </article>
          </div>
          {matchedOverlay.source || matchedOverlay.inputs || matchedOverlay.summary ? (
            <ul className="summary-list overlay-summary-list">
              {matchedOverlay.source ? (
                <li>
                  <strong>{matchedOverlay.source.solver}</strong>
                  <span>
                    {matchedOverlay.source.turbulenceModel} · case {matchedOverlay.source.caseId}
                  </span>
                </li>
              ) : null}
              {matchedOverlay.inputs ? (
                <li>
                  <strong>Scenario inputs</strong>
                  <span>
                    {matchedOverlay.inputs.speedMps} m/s · yaw {matchedOverlay.inputs.yawDeg} deg · ride height {matchedOverlay.inputs.rideHeightMm} mm · wheels {matchedOverlay.inputs.wheelMode}
                  </span>
                </li>
              ) : null}
              {matchedOverlay.summary ? (
                <li>
                  <strong>Quick metrics</strong>
                  <span>
                    Cd {matchedOverlay.summary.cd ?? "-"} · Cl {matchedOverlay.summary.cl ?? "-"} · aero balance {matchedOverlay.summary.downforceBalancePct ?? "-"}%
                  </span>
                </li>
              ) : null}
            </ul>
          ) : null}
          <ul className="summary-list overlay-summary-list">
            {matchedOverlay.overlays.hotspots.map((hotspot) => (
              <li key={hotspot.id}>
                <strong>{hotspot.label}</strong>
                <span>
                  Field {hotspot.field} · value {hotspot.value}
                </span>
              </li>
            ))}
          </ul>
          <ul className="summary-list overlay-summary-list">
            {matchedOverlay.overlays.streamlines.map((streamline) => (
              <li key={streamline.id}>
                <strong>{streamline.id}</strong>
                <span>
                  {streamline.count} streamlines · color {streamline.color}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeHotspotConfig ? (
        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Hotspot annotations</p>
              <h2>{activeHotspotConfig.label}</h2>
            </div>
          </div>
          <div className="hotspot-list">
            {(modelConfig?.hotspots ?? []).map((hotspot) => (
              <button
                className="hotspot-list__item"
                key={hotspot.id}
                onClick={() => {
                  setActiveHotspot(hotspot.id);
                  applyCameraPreset(hotspot.cameraOrbit, hotspot.cameraTarget);
                  updateQuery({ season, constructorSlug, focus: hotspot.id, camera: undefined });
                }}
                type="button"
              >
                <strong>{hotspot.label}</strong>
                <span>{hotspot.description}</span>
                <span className="surface-card__link">Deep link ?season={season}&constructor={constructorSlug}&focus={hotspot.id}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
