import { SurfaceCard } from "@/components/story/surface-card";
import { learnModules } from "./modules";

export default function LearnPage() {
  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Learn surface</p>
        <h1>Break the car into focused engineering reads.</h1>
        <p className="lead">
          These modules keep the longform explainer ideas, but split them into shorter stories that can branch
          directly from Modelview and Replay.
        </p>
      </section>

      <section className="panel-grid panel-grid--three">
        {learnModules.map((module) => (
          <SurfaceCard
            key={module.slug}
            eyebrow={`/learn/${module.slug}`}
            title={module.title}
            href={`/learn/${module.slug}`}
            ctaLabel="Open module ->"
            meta={`${module.nextLinks.length} next links`}
            tone="learn"
            items={module.nextLinks.map((link) => link.label)}
          >
            {module.description}
          </SurfaceCard>
        ))}
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Concept source</p>
            <h2>Current explainer reference</h2>
          </div>
        </div>
        <p>
          The concept source still lives at <code>interactive-explanation/formula-1-racing/</code>, but this product
          treats each subsystem as its own chapter so users can move from the model to the explanation without losing context.
        </p>
      </section>
    </div>
  );
}
