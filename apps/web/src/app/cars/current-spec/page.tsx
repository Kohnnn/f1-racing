import { Suspense } from "react";
import { CarModelBrowser } from "@/components/model-viewer/car-model-browser";
import { ModelviewScrollSpy } from "@/components/model-viewer/modelview-scrollspy";
import { getCarModelCatalog, getLatestManifest } from "@/lib/data";

const SCROLLSPY_SECTIONS = [
  { id: "pick-a-car", label: "Pick a car" },
  { id: "studio-stage", label: "Studio" },
  { id: "wind-tunnel", label: "Wind tunnel" },
  { id: "use-modelview-well", label: "Next steps" },
];

export const metadata = {
  title: "Modelview",
  description: "Inspect the current Formula 1 car GLBs in 3D.",
};

export default async function CarModelPage() {
  const [catalog, latestManifest] = await Promise.all([
    getCarModelCatalog(),
    getLatestManifest(),
  ]);
  const latestReplayHref = latestManifest.latest.path.replace(/^\/sessions\//, "/replay/");

  return (
    <div className="page-stack">
      <section className="hero hero--compact hero--compact-modelview replay-hero model-surface-hero">
        <p className="eyebrow">Modelview</p>
        <h1>Rotate the car. Inspect the airflow.</h1>
        <p className="lead">
          Pick a constructor below. The studio rig and the wind tunnel sit right under the controls.
        </p>
      </section>

      <ModelviewScrollSpy sections={SCROLLSPY_SECTIONS} />

      <Suspense fallback={<div className="panel">Loading model...</div>}>
        <CarModelBrowser catalog={catalog} latestReplayHref={latestReplayHref} />
      </Suspense>

      <section id="use-modelview-well" className="panel landing-journey modelview-anchor">
        <div className="section-header">
          <div>
            <p className="eyebrow">Use modelview well</p>
            <h2>Start from shape, then move into explanation and pace.</h2>
          </div>
        </div>
        <div className="journey-grid">
          <a className="journey-step" href="/learn/car">
            <span className="journey-step__index">01</span>
            <h3>Read the car first</h3>
            <p>Use the car primer when you want the whole chassis and packaging story before focusing on one subsystem.</p>
          </a>
          <a className="journey-step" href="/learn/aero">
            <span className="journey-step__index">02</span>
            <h3>Follow the airflow</h3>
            <p>Jump into the aero module when the wing, floor, or diffuser shape is the thing you want to understand.</p>
          </a>
          <a className="journey-step" href={latestReplayHref}>
            <span className="journey-step__index">03</span>
            <h3>Watch the effect on track</h3>
            <p>Carry the same car story into replay when you want to see how setup and aero tradeoffs surface in a session.</p>
          </a>
        </div>
      </section>
    </div>
  );
}
