import { getCircuitArt } from "@/lib/art";
import {
  getEvidenceBriefIndex,
  getLatestManifest,
  type EvidenceBrief,
  type EvidenceBriefHandoff,
} from "@/lib/data";
import { DashboardHandoff } from "@/components/story/dashboard-handoff";
import { LearningTrail } from "@/components/story/learning-trail";
import type { LearningTrailInput, LearnModuleId } from "@/lib/learning-trail";

export const metadata = {
  title: {
    absolute: "F1 Racing — Engineering Dashboard",
  },
  description: "Learn one Formula 1 engineering subsystem through recorded race evidence.",
  alternates: {
    canonical: "/",
  },
};

function handoffLabel(handoff: EvidenceBriefHandoff) {
  if (handoff.kind === "replay") return "Open recorded evidence";
  if (handoff.kind === "modelview") return "Inspect orientation in Modelview";
  return `Read ${handoff.href.slice("/learn/".length)}`;
}

function trailForHandoff(brief: EvidenceBrief, activeHandoff: EvidenceBriefHandoff): LearningTrailInput {
  const learnHref = activeHandoff.kind === "learn"
    ? activeHandoff.href
    : brief.handoffs.find(({ kind }) => kind === "learn")?.href;
  const replayHref = brief.handoffs.find(({ kind }) => kind === "replay")?.href;
  const modelviewHref = brief.handoffs.find(({ kind }) => kind === "modelview")?.href;
  if (!learnHref) throw new Error(`Evidence brief ${brief.id} has no Learn handoff.`);
  return {
    briefId: brief.id,
    learn: { slug: learnHref.slice("/learn/".length) as LearnModuleId },
    ...(replayHref ? { replayHref } : {}),
    ...(modelviewHref ? { modelviewHref } : {}),
  };
}

function EvidenceClaims({ brief, compact = false }: { brief: EvidenceBrief; compact?: boolean }) {
  return (
    <>
      <dl className={`dashboard-evidence${compact ? " dashboard-evidence--compact" : ""}`}>
        {brief.evidence.map((claim) => (
          <div data-claim-class={claim.class} key={claim.id}>
            <dt>{claim.class}</dt>
            <dd>{claim.statement}</dd>
            <dd className="dashboard-evidence__scope">{claim.coverage} Limit: {claim.uncertainty}</dd>
          </div>
        ))}
      </dl>
      <div className="dashboard-prohibited">
        <strong>Do not conclude</strong>
        <ul>{brief.prohibitedConclusions.map((conclusion) => <li key={conclusion}>{conclusion}</li>)}</ul>
      </div>
    </>
  );
}

function BriefActions({ brief, compact = false }: { brief: EvidenceBrief; compact?: boolean }) {
  return (
    <div className="dashboard-actions">
      {brief.handoffs.map((handoff, index) => (
        <DashboardHandoff
          className={index === 0 ? "button" : compact ? "dashboard-text-link" : "button button--secondary"}
          href={handoff.href}
          key={`${handoff.kind}:${handoff.href}`}
          trail={trailForHandoff(brief, handoff)}
        >
          {handoffLabel(handoff)}
        </DashboardHandoff>
      ))}
    </div>
  );
}

export default async function HomePage() {
  const [manifest, briefIndex] = await Promise.all([getLatestManifest(), getEvidenceBriefIndex()]);
  const [featuredBrief, ...nextBriefs] = briefIndex.briefs;
  if (!featuredBrief) throw new Error("No generated evidence briefs.");
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

      <section className="dashboard-feature" id={`brief-${featuredBrief.id}`} aria-labelledby="featured-brief-title">
        <div className="dashboard-feature__main">
          <p className="dashboard-label">Featured subsystem · {featuredBrief.subsystem.join(" and ")}</p>
          <h2 id="featured-brief-title">{featuredBrief.title}</h2>
          <p className="dashboard-feature__question">{featuredBrief.question}</p>
          <p className="dashboard-learning-outcome"><strong>Learning outcome:</strong> {featuredBrief.learningOutcome}</p>
          <EvidenceClaims brief={featuredBrief} />
          <BriefActions brief={featuredBrief} />
        </div>

        <aside className="dashboard-feature__rail" aria-label="Featured brief route">
          {monzaArt.map ? <img src={monzaArt.map} alt="Monza circuit outline" /> : null}
          <div>
            <span>Evidence route</span>
            <strong>Replay → Learn → evidence ceiling</strong>
          </div>
          <p>Start with the comparison trace. Move to the explanation only after naming what the trace does and does not show.</p>
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
              <article className="dashboard-brief" id={`brief-${brief.id}`} key={brief.id}>
                <p className="dashboard-label">{brief.subsystem.join(" and ")}</p>
                <div className="dashboard-brief__body">
                  <h3>{brief.title}</h3>
                  <p>{brief.question}</p>
                  <p className="dashboard-learning-outcome"><strong>Learning outcome:</strong> {brief.learningOutcome}</p>
                  <EvidenceClaims brief={brief} compact />
                  <BriefActions brief={brief} compact />
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="dashboard-trail" aria-label="Browser-local learning trail">
          <LearningTrail />
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
          <a className="dashboard-surface-links__historical" href="/race-desk"><span>Historical Race Desk</span><strong>Accelerated historical replay simulation, not live timing</strong></a>
        </div>
      </section>
    </div>
  );
}
