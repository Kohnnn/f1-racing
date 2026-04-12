import { getCarModelCatalog, getLatestManifest, getTeamProfile } from "@/lib/data";
import { LandingStage } from "@/components/story/landing-stage";
import { learnModules } from "./learn/modules";

export default async function HomePage() {
  const [manifest, catalog, redBullProfile] = await Promise.all([
    getLatestManifest(),
    getCarModelCatalog(),
    getTeamProfile("red-bull-racing"),
  ]);

  const leadModel = catalog.models.find((model) => model.id === "red-bull-2025-rb21")
    ?? catalog.models.find((model) => model.surfaceReady)
    ?? catalog.models[0];
  const featuredLearn = learnModules.find((module) => module.slug === "aero") ?? learnModules[0];
  const replayHref = manifest.latest.path.replace(/^\/sessions\//, "/replay/");

  return (
    <div className="page-stack page-stack--landing">
      <section className="landing-cinematic">
        <div className="landing-cinematic__copy">
          <div>
            <p className="landing-kicker">Replay-first race viewer</p>
            <h1>
              <span>Replay</span>
              <span>the race.</span>
            </h1>
            <p className="landing-cinematic__lead">
              Start from the session replay, keep the track map, leaderboard, and driver telemetry in one workspace,
              then branch into Modelview or Learn only when you need more engineering context.
            </p>
          </div>

          <a className="landing-start" href={replayHref}>
            <strong>Open latest replay</strong>
            <span>[LIVE PACK]</span>
          </a>

          <div className="landing-support-grid" aria-label="Secondary product routes">
            <a className="landing-support-card" href="/live">
              <span>Primary route</span>
              <strong>Live</strong>
              <p>Open the socket-backed live board or the fallback simulator to watch the current session as a control room surface.</p>
            </a>
            <a className="landing-support-card" href="/cars/current-spec">
              <span>Secondary route</span>
              <strong>Modelview</strong>
              <p>Inspect the current car in 3D when replay points you to a part or aero surface.</p>
            </a>
            <a className="landing-support-card" href={`/learn/${featuredLearn.slug}`}>
              <span>Secondary route</span>
              <strong>Learn</strong>
              <p>Read the engineering note behind the exact subsystem or setup tradeoff you just saw on track.</p>
            </a>
          </div>
        </div>

        {leadModel ? (
          <LandingStage
            modelSrc={leadModel.file}
            posterSrc={leadModel.poster}
            modelTitle={leadModel.displayName}
            sizeLabel={leadModel.sizeLabel}
            modelScale={leadModel.heroScale || leadModel.modelScale}
            heroCamera={leadModel.heroCamera}
            replayLabel={`${manifest.latest.grandPrixName} · ${manifest.latest.sessionName}`}
            learnLabel={featuredLearn.title}
            note={leadModel.notes}
            teamProfile={redBullProfile}
          />
        ) : null}
      </section>

      <section className="landing-briefing landing-briefing--replay-first">
        <div className="landing-briefing__copy">
          <p className="eyebrow">Core loop</p>
          <h2>Choose a pack. Watch the replay. Inspect only when needed.</h2>
          <p>
            The core product is the replay workspace. Modelview and Learn stay in the product, but as supporting
            routes that deepen the same story instead of competing for top-level attention.
          </p>
          <div className="hero-actions">
            <a className="button button--secondary" href="/live">Open live feed</a>
            <a className="button" href="/replay">Browse replay library</a>
            <a className="button button--secondary" href="/cars/current-spec">Open modelview</a>
            <a className="button button--ghost" href="/learn">Open learn</a>
          </div>
        </div>

        <div className="landing-briefing__stack">
          <div>
            <span>Latest pack</span>
            <strong>{manifest.latest.grandPrixName} · {manifest.latest.sessionName}</strong>
          </div>
          <div>
            <span>Replay library</span>
            <strong>{manifest.latest.season} season sessions ready to browse</strong>
          </div>
          <div>
            <span>Secondary routes</span>
            <strong>{catalog.models.length} GLB cars · {learnModules.length} learn modules</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
