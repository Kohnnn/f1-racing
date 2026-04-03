import { getCarModelCatalog, getLatestManifest } from "@/lib/data";
import { SurfaceCard } from "@/components/story/surface-card";
import { learnModules } from "./learn/modules";

export default async function HomePage() {
  const [manifest, catalog] = await Promise.all([
    getLatestManifest(),
    getCarModelCatalog(),
  ]);

  const leadModel = catalog.models.find((model) => model.surfaceReady) ?? catalog.models[0];
  const featuredLearn = learnModules.find((module) => module.slug === "aero") ?? learnModules[0];
  const replayHref = manifest.latest.path.replace(/^\/sessions\//, "/replay/");

  return (
    <div className="page-stack page-stack--landing">
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="eyebrow">Replay · Modelview · Learn</p>
          <div className="landing-mode-strip" aria-label="Primary product surfaces">
            <a href="/cars/current-spec">Modelview</a>
            <a href={replayHref}>Replay</a>
            <a href="/learn">Learn</a>
          </div>
          <h1>See the car in studio light. Chase the same story into replay and learning.</h1>
          <p className="lead">
            F1 Racing is built as one connected loop: inspect the machine in 3D, jump into the engineering
            notes behind each part, then verify the tradeoff against a real session pack on track.
          </p>
          <div className="hero-actions">
            <a className="button" href="/cars/current-spec">Open Modelview</a>
            <a className="button button--secondary" href={replayHref}>Watch Replay</a>
            <a className="button button--ghost" href={`/learn/${featuredLearn.slug}`}>
              Start with {featuredLearn.title}
            </a>
          </div>
          <div className="landing-hero__facts">
            <div>
              <span>Current studio frame</span>
              <strong>{leadModel?.displayName || "Current spec model"}</strong>
            </div>
            <div>
              <span>Latest replay pack</span>
              <strong>
                {manifest.latest.grandPrixName} · {manifest.latest.sessionName}
              </strong>
            </div>
            <div>
              <span>Learning modules</span>
              <strong>{learnModules.length} focused engineering chapters</strong>
            </div>
          </div>
        </div>

        <div className="landing-hero__stage">
          <div className="landing-stage">
            <div className="landing-stage__glow" />
            {leadModel?.poster ? (
              <img
                className="landing-stage__poster"
                src={leadModel.poster}
                alt={`${leadModel.displayName} studio poster`}
              />
            ) : null}
            <div className="landing-stage__spec">
              <p className="eyebrow">Studio frame</p>
              <strong>{leadModel?.displayName || "Current spec"}</strong>
              <span>{leadModel?.sizeLabel || "Local GLB"}</span>
            </div>
            <div className="landing-stage__chip landing-stage__chip--top">Front wing + floor callouts</div>
            <div className="landing-stage__chip landing-stage__chip--right">Constructor switching</div>
            <div className="landing-stage__chip landing-stage__chip--bottom">Replay and Learn branch from the same car story</div>
          </div>
        </div>
      </section>

      <section className="landing-surface-grid">
        <SurfaceCard
          eyebrow="Primary surface"
          title="Modelview"
          href="/cars/current-spec"
          ctaLabel="Enter the studio ->"
          meta="Current-spec car"
          tone="model"
          items={[
            "Orbit the car with local GLB assets",
            "Switch season and constructor in one view",
            "Use the model as the launch point into deeper explainers",
          ]}
        >
          Start with the machine itself: bodywork, stance, and packaging before you move into aero or race pace.
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Race surface"
          title="Replay"
          href={replayHref}
          ctaLabel="Open session replay ->"
          meta={`${manifest.latest.season} live pack`}
          tone="replay"
          items={[
            "Track playback with full-field order",
            "Leaderboard plus selected-driver telemetry",
            "Built from compact exported race packs instead of live API calls",
          ]}
        >
          Follow a real session frame by frame, keep the field in view, and drill into one driver when the lap story turns.
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Engineering surface"
          title="Learn"
          href="/learn"
          ctaLabel="Open engineering modules ->"
          meta={`${learnModules.length} modules`}
          tone="learn"
          items={[
            "Focused chapters for aero, tyres, braking, setup, and strategy",
            "Shorter reads than the old monolithic explainer",
            "Designed to link back into the model and replay surfaces",
          ]}
        >
          Read one subsystem at a time so wings, tyres, and braking all have a clear place inside the product.
        </SurfaceCard>
      </section>

      <section className="panel landing-journey">
        <div className="section-header">
          <div>
            <p className="eyebrow">From part to pace</p>
            <h2>One product loop, not three disconnected pages.</h2>
          </div>
        </div>
        <div className="journey-grid">
          <a className="journey-step" href="/cars/current-spec">
            <span className="journey-step__index">01</span>
            <h3>Inspect the car</h3>
            <p>Use Modelview to anchor the story around the current-spec chassis, floor, wing shapes, and packaging.</p>
          </a>
          <a className="journey-step" href={`/learn/${featuredLearn.slug}`}>
            <span className="journey-step__index">02</span>
            <h3>Read the subsystem</h3>
            <p>Jump straight into the module that explains the exact part or setup compromise you just noticed.</p>
          </a>
          <a className="journey-step" href={replayHref}>
            <span className="journey-step__index">03</span>
            <h3>Verify it in replay</h3>
            <p>Open a real session pack and watch how the same engineering decision shows up in track position and telemetry.</p>
          </a>
        </div>
      </section>

      <section className="panel landing-proof-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Product depth</p>
            <h2>Built for F1 engineering stories, not a generic dashboard shell.</h2>
          </div>
        </div>
        <div className="landing-proof-grid">
          <article className="landing-proof-card">
            <span>Model library</span>
            <strong>{catalog.models.length} local 2025 cars</strong>
            <p>Poster-backed current-spec models already wired into the app and ready for richer hotspot storytelling.</p>
          </article>
          <article className="landing-proof-card">
            <span>Replay coverage</span>
            <strong>{manifest.latest.grandPrixName}</strong>
            <p>The current live sample opens directly into replay, sessions, compare, and stint routes backed by exported packs.</p>
          </article>
          <article className="landing-proof-card">
            <span>Learn surface</span>
            <strong>{featuredLearn.title} as a branch point</strong>
            <p>Use focused modules instead of one giant article so the model and replay surfaces can stay fast and linked.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
