import { learnModules } from "./modules";

export default function LearnPage() {
  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Learn surface</p>
        <h1>Break the current F1 explainer into focused learning modules.</h1>
        <p className="lead">
          The existing longform explainer remains the concept source, but this product should ship smaller,
          clearer pages that explain one engineering story at a time.
        </p>
      </section>

      <section className="panel-grid panel-grid--two">
        {learnModules.map((module) => (
          <a className="panel surface-card surface-card__anchor" key={module.slug} href={`/learn/${module.slug}`}>
            <p className="eyebrow">/learn/{module.slug}</p>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
            <span className="surface-card__link">Open module -&gt;</span>
          </a>
        ))}
      </section>

      <section className="panel-grid panel-grid--two">
        <article className="panel surface-card">
          <p className="eyebrow">/cars/current-spec</p>
          <h3>Model surface</h3>
          <p>Use the dedicated 3D page for constructor and season GLB selection rather than embedding heavy model assets into every explain-first route.</p>
        </article>
        <article className="panel surface-card">
          <p className="eyebrow">/sims/wind</p>
          <h3>Wind surface</h3>
          <p>Use a baked CFD viewer flow with precomputed scenarios, then connect that output back into the aero learning modules.</p>
        </article>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Concept source</p>
            <h2>Current explainer reference</h2>
          </div>
        </div>
        <p>
          The current concept source lives at <code>interactive-explanation/formula-1-racing/</code>. This new
          app should reuse its ideas, but not keep everything inside one monolithic page.
        </p>
      </section>
    </div>
  );
}
