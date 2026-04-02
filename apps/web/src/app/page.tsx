import { getLatestManifest } from "@/lib/data";
import { SurfaceCard } from "@/components/story/surface-card";

export default async function HomePage() {
  const manifest = await getLatestManifest();

  return (
    <div className="page-stack">
      <section className="hero">
        <p className="eyebrow">Formula 1 explainer + telemetry product</p>
        <h1>Three surfaces: the model, the replay, and the learning module.</h1>
        <p className="lead">
          This workspace is set up for a CDN-first Formula 1 site that serves compact session packs,
          explanation modules, compare views, and a 3D car model viewer — without making the browser
          talk to OpenF1 on every page load.
        </p>
        <div className="hero-actions">
          <a className="button" href={manifest.latest.path}>Open sample session</a>
          <a className="button button--secondary" href="/cars/current-spec">Open car model</a>
          <a className="button button--secondary" href="/learn">Open learn modules</a>
        </div>
      </section>

      <section className="panel-grid panel-grid--three">
        <SurfaceCard eyebrow="Surface 1" title="Learn" href="/learn">
          Car systems, aero, tyres, braking, setup, and strategy — broken into focused modules.
        </SurfaceCard>
        <SurfaceCard eyebrow="Surface 2" title="Sessions" href="/sessions">
          Session explorer, lap compare, stint stories, and race engineering pages backed by static OpenF1 packs.
        </SurfaceCard>
        <SurfaceCard eyebrow="Surface 3" title="Car model" href="/cars/current-spec">
          Dedicated 3D viewer surface for season and constructor model selection using local GLB assets.
        </SurfaceCard>
      </section>

      <section className="panel architecture-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Recommended deployment</p>
            <h2>Static app + CDN packs + thin edge API</h2>
          </div>
        </div>
        <div className="architecture-grid">
          <div>
            <h3>Frontend</h3>
            <p>Next.js app router with static generation for learn pages and session indexes.</p>
          </div>
          <div>
            <h3>Storage</h3>
            <p>Versioned session and sim packs in object storage behind global edge caching.</p>
          </div>
          <div>
            <h3>Upstream</h3>
            <p>OpenF1 for ingestion, normalized offline into small browser-safe packs.</p>
          </div>
          <div>
            <h3>Optional extras</h3>
            <p>model-viewer for the car page and precomputed wind results for the aero learn modules.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
