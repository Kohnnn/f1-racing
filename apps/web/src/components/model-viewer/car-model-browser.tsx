"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CarModelCatalog } from "@/lib/data";

interface CarModelBrowserProps {
  catalog: CarModelCatalog;
}

type ModelViewerElement = HTMLElement & {
  cameraOrbit?: string;
  cameraTarget?: string;
};

export function CarModelBrowser({ catalog }: CarModelBrowserProps) {
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

  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  const selected = catalog.models.find(
    (m) => m.season === season && m.constructorSlug === constructorSlug,
  );

  if (!selected) {
    return <div className="panel">No models available.</div>;
  }

  return (
    <div className="panel car-viewer-minimal">
      <div className="control-row">
        <label className="control-field">
          <span>Season</span>
          <select
            value={season}
            onChange={(e) => {
              const next = Number(e.target.value);
              setSeason(next);
              const firstForSeason = catalog.models.find((m) => m.season === next);
              if (firstForSeason) setConstructorSlug(firstForSeason.constructorSlug);
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
            onChange={(e) => setConstructorSlug(e.target.value)}
          >
            {uniqueConstructors.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="car-viewer-canvas">
        {createElement("model-viewer", {
          ref: viewerRef,
          src: selected.file,
          alt: selected.displayName,
          "camera-controls": true,
          "camera-orbit": "30deg 75deg 2.4m",
          "camera-target": "0m 0.25m 0m",
          exposure: "1.05",
          "shadow-intensity": "1",
          "touch-action": "pan-y",
          "interaction-prompt": "auto",
          "environment-image": "neutral",
          style: {
            width: "100%",
            height: "min(65vh, 640px)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(240,232,222,0.94))",
            borderRadius: "20px",
          },
        })}
      </div>

      <p className="car-viewer-meta">
        <span>{selected.displayName}</span>
        <span>{selected.sizeLabel}</span>
      </p>
    </div>
  );
}
