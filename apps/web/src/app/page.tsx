import { getLatestManifest } from "@/lib/data";
import { getCircuitArt } from "@/lib/art";

export const metadata = {
  title: {
    absolute: "F1 Racing — Engineering Dashboard",
  },
  description: "Learn one Formula 1 engineering subsystem through recorded race evidence.",
};

const featuredBrief = {
  title: "Braking zone versus exit",
  question: "On two Monza qualifying laps, where does VER gain or lose time to NOR — and what can the recorded traces establish?",
  replayHref: "/replay/2025/italian-grand-prix/qualifying?tab=compare&drivers=VER,NOR#analysis",
  learnHref: "/learn/braking",
  modelHref: "/cars/current-spec?focus=brakes",
};

const nextBriefs = [
  {
    title: "Whole-lap advantage without a magic corner",
    label: "Mexico City · Aero",
    summary: "Read a faster lap in every sector without claiming an unmeasured setup or rear-wing cause.",
    href: "/replay/2025/mexico-city-grand-prix/race?tab=compare&drivers=NOR,LEC#analysis",
  },
  {
    title: "A safety-car interruption changes the question",
    label: "Zandvoort · Strategy and tyres",
    summary: "Use the recorded control timeline to decide when raw pace comparison must stop.",
    href: "/replay/2025/dutch-grand-prix/race?tab=racecontrol#analysis",
  },
] as const;

export default async function HomePage() {
  const manifest = await getLatestManifest();
  const monzaArt = getCircuitArt("monza");
  const latestReplayHref = manifest.latest
    ? manifest.latest.path.replace(/^\/sessions\//, "/replay/")
    : "/replay";

  return (
    <div className="dashboard">
      <section className="dashboard__intro" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">Dashboard · recorded race evidence</p>
          <h1 id="dashboard-title">Choose one engineering question. Follow the evidence.</h1>
        </div>
        <p>
          Replay holds the record. Learn explains the mechanism. Modelview supplies orientation, not session proof.
        </p>
      </section>

      <section className="dashboard-feature" aria-labelledby="featured-brief-title">
        <div className="dashboard-feature__main">
          <p className="dashboard-label">Featured brief · Monza qualifying</p>
          <h2 id="featured-brief-title">{featuredBrief.title}</h2>
          <p className="dashboard-feature__question">{featuredBrief.question}</p>
          <dl className="dashboard-evidence">
            <div>
              <dt>Recorded</dt>
              <dd>VER lap 17 and NOR lap 20, sector deltas, sampled brake, speed, gear, throttle, and DRS traces.</dd>
            </div>
            <div>
              <dt>Derived</dt>
              <dd>Brake-onset, minimum-speed, and throttle-pickup annotations from the sampled traces.</dd>
            </div>
            <div>
              <dt>Unknown</dt>
              <dd>Brake balance, temperature, energy recovery, line choice, and the literal braking point.</dd>
            </div>
          </dl>
          <div className="dashboard-actions">
            <a className="button" href={featuredBrief.replayHref}>Open recorded evidence</a>
            <a className="button button--secondary" href={featuredBrief.learnHref}>Read braking</a>
            <a className="dashboard-text-link" href={featuredBrief.modelHref}>Inspect brake hardware in Modelview</a>
          </div>
        </div>

        <aside className="dashboard-feature__rail" aria-label="Featured brief route">
          {monzaArt.map ? <img src={monzaArt.map} alt="Monza circuit outline" /> : null}
          <div>
            <span>Evidence route</span>
            <strong>Replay → Learn → evidence ceiling</strong>
          </div>
          <p>Start with the comparison trace. Move to the Braking module only after naming what the trace does and does not show.</p>
        </aside>
      </section>

      <section className="dashboard-grid" aria-label="Dashboard next steps">
        <div className="dashboard-queue">
          <div className="dashboard-section-heading">
            <div>
              <p className="eyebrow">Next evidence questions</p>
              <h2>Continue with a different kind of limit.</h2>
            </div>
            <a className="dashboard-text-link" href="/replay">Browse Replay library</a>
          </div>
          <div className="dashboard-brief-list">
            {nextBriefs.map((brief) => (
              <a className="dashboard-brief" href={brief.href} key={brief.title}>
                <span>{brief.label}</span>
                <strong>{brief.title}</strong>
                <p>{brief.summary}</p>
                <em>Open Replay evidence</em>
              </a>
            ))}
          </div>
        </div>

        <aside className="dashboard-trail" aria-labelledby="learning-trail-title">
          <p className="eyebrow">Related explanation</p>
          <h2 id="learning-trail-title">Understand the mechanism.</h2>
          <p>The Braking module explains the control and energy tradeoffs behind the recorded comparison.</p>
          <a className="button button--secondary" href="/learn/braking">Open Braking</a>
        </aside>
      </section>

      <section className="dashboard-surfaces" aria-label="Product surfaces">
        <div>
          <p className="eyebrow">Keep the roles distinct</p>
          <h2>One journey, separate workspaces.</h2>
        </div>
        {!manifest.latest ? (
          <p className="dashboard-feature__question">No current featured race pack. Browse the verified historical Replay library.</p>
        ) : null}
        <div className="dashboard-surface-links">
          <a href={latestReplayHref}><span>Replay</span><strong>{manifest.latest ? "Recorded session workspace" : "Historical Replay library"}</strong></a>
          <a href="/learn"><span>Learn</span><strong>Engineering explanations</strong></a>
          <a href="/cars/current-spec"><span>Modelview</span><strong>Current-car orientation</strong></a>
          <a className="dashboard-surface-links__historical" href="/race-desk"><span>Historical Race Desk</span><strong>Replay simulation, not live timing</strong></a>
        </div>
      </section>
    </div>
  );
}
