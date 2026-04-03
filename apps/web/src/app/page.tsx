import { getCarModelCatalog, getLatestManifest } from "@/lib/data";
import { LandingStage } from "@/components/story/landing-stage";
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
      <section className="landing-cinematic">
        <div className="landing-cinematic__copy">
          <div>
            <p className="landing-kicker">Kinetic precision engineering</p>
            <h1>
              <span>See the car.</span>
              <span>Chase the lap.</span>
            </h1>
            <p className="landing-cinematic__lead">
              Open the real GLB model first, step into the engineering note behind the part, then carry the same story
              into replay with session telemetry and full-field context.
            </p>
          </div>

          <a className="landing-start" href="/cars/current-spec">
            <strong>Initialize Modelview</strong>
            <span>[START]</span>
          </a>

          <div className="landing-mode-grid" aria-label="Primary product surfaces">
            <a className="landing-mode-card landing-mode-card--active" href="/cars/current-spec">
              <span>Modelview</span>
              <strong>{leadModel?.displayName || "Current spec car"}</strong>
              <p>Orbit the real chassis, switch constructors, and keep the machine in view.</p>
            </a>
            <a className="landing-mode-card" href={replayHref}>
              <span>Replay</span>
              <strong>{manifest.latest.grandPrixName}</strong>
              <p>Open the latest exported race pack and follow one engineering story through the lap.</p>
            </a>
            <a className="landing-mode-card" href={`/learn/${featuredLearn.slug}`}>
              <span>Technical Learn</span>
              <strong>{featuredLearn.title}</strong>
              <p>Read the subsystem note that explains the model and replay behavior in one place.</p>
            </a>
          </div>
        </div>

        {leadModel ? (
          <LandingStage
            modelSrc={leadModel.file}
            modelTitle={leadModel.displayName}
            sizeLabel={leadModel.sizeLabel}
            replayLabel={`${manifest.latest.grandPrixName} · ${manifest.latest.sessionName}`}
            learnLabel={featuredLearn.title}
            note={leadModel.notes}
          />
        ) : null}
      </section>

      <section className="landing-briefing">
        <div className="landing-briefing__copy">
          <p className="eyebrow">System loop</p>
          <h2>One machine, three surfaces.</h2>
          <p>
            Modelview is the anchor. Replay is the proof. Learn is the engineering read between them. The landing now
            treats those three surfaces as one control loop instead of stacking generic feature cards.
          </p>
        </div>

        <div className="landing-briefing__stack">
          <div>
            <span>Model library</span>
            <strong>{catalog.models.length} local GLB cars</strong>
          </div>
          <div>
            <span>Replay pack</span>
            <strong>{manifest.latest.season} {manifest.latest.trackId}</strong>
          </div>
          <div>
            <span>Learn modules</span>
            <strong>{learnModules.length} focused engineering reads</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
