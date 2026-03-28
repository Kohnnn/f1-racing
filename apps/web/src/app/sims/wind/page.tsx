import { getOpenFoamStarterCase, getWindOverlaySchemaExample, getWindScenarioCatalog } from "@/lib/data";

export default async function WindSimPage() {
  const [wind, overlaySchema, starterCase] = await Promise.all([
    getWindScenarioCatalog(),
    getWindOverlaySchemaExample(),
    getOpenFoamStarterCase(),
  ]);

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Wind surface</p>
        <h1>Feasible as a baked CFD viewer, not as a live in-browser solver.</h1>
        <p className="lead">
          The recommended app pattern is to treat CFD as precomputed data. Load a matching car mesh, then attach
          pressure, friction, or streamline packs on top of it. The browser should visualize the result, not solve it.
        </p>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Local starter case</p>
            <h2>{starterCase.label}</h2>
          </div>
        </div>
        <p>
          Status: <strong>{starterCase.status}</strong>. Run the CFD case from <code>{starterCase.casePath}</code>, then build the
          browser pack from <code>{starterCase.overlayConfigExamplePath}</code>.
        </p>
        <div className="panel-grid panel-grid--two">
          <article className="panel panel--nested">
            <p className="eyebrow">Defaults</p>
            <h3>{starterCase.solver}</h3>
            <p>
              {starterCase.defaults.speedMps} m/s · yaw {starterCase.defaults.yawDeg} deg · ride height {starterCase.defaults.rideHeightMm} mm.
            </p>
            <p>
              Ground: {starterCase.defaults.groundMode}. Wheels: {starterCase.defaults.wheelMode}.
            </p>
          </article>
          <article className="panel panel--nested">
            <p className="eyebrow">Outputs</p>
            <h3>First publishable artifacts</h3>
            <ul className="summary-list overlay-summary-list">
              {starterCase.outputs.map((output) => (
                <li key={output}>
                  <span>{output}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
        <ol className="ordered-list">
          {starterCase.requiredUserInputs.map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong> - {item.description}
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Source scenarios</p>
            <h2>{wind.source.name}</h2>
          </div>
        </div>
        <p>
          <strong>Feasible for prototype:</strong> {wind.source.feasibleForPrototype ? "yes" : "no"}
          <br />
          <strong>Direct F1 overlay ready:</strong> {wind.source.directF1OverlayReady ? "yes" : "no"}
        </p>
        <ul className="summary-list">
          {wind.source.notes.map((note) => (
            <li key={note}>
              <span>{note}</span>
            </li>
          ))}
        </ul>
        <p>
          Source: <a className="inline-link" href={wind.source.repository} target="_blank" rel="noreferrer">{wind.source.repository}</a>
        </p>
      </section>

      <section className="panel-grid panel-grid--two">
        {wind.scenarios.map((scenario) => (
          <article className="panel surface-card" key={scenario.id}>
            <p className="eyebrow">{scenario.type}</p>
            <h3>{scenario.label}</h3>
            <p>
              Status: {scenario.status}. Fields: {scenario.fields.join(", ")}. Surface ready: {scenario.surfaceReady ? "yes" : "no"}.
            </p>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Baked overlay schema</p>
            <h2>Recommended CFD pack shape</h2>
          </div>
        </div>
        <div className="panel-grid panel-grid--two">
          <article className="panel panel--nested">
            <p className="eyebrow">Binding</p>
            <h3>{overlaySchema.displayName ?? overlaySchema.modelId}</h3>
            <p>
              Scenario <code>{overlaySchema.scenarioId}</code> binds CFD results to render mesh <code>{overlaySchema.meshBinding.renderMeshId}</code>
              using <strong>{overlaySchema.meshBinding.mappingMode}</strong> with {overlaySchema.meshBinding.triangleCount.toLocaleString()} triangles.
            </p>
          </article>
          <article className="panel panel--nested">
            <p className="eyebrow">Fields</p>
            <h3>{overlaySchema.metric.toUpperCase()} as the first surface metric</h3>
            <p>
              Start with surface pressure and friction, then layer streamlines and hotspot probes on top of the same car mesh.
            </p>
            {overlaySchema.inputs ? (
              <p>
                Example inputs: {overlaySchema.inputs.speedMps} m/s, yaw {overlaySchema.inputs.yawDeg} deg, ride height {overlaySchema.inputs.rideHeightMm} mm.
              </p>
            ) : null}
          </article>
        </div>
        <ul className="summary-list">
          {overlaySchema.scalarFields.map((field) => (
            <li key={field.name}>
              <strong>{field.name}</strong>
              <span>
                Domain: {field.domain} · min {field.stats.min} · max {field.stats.max} · mean {field.stats.mean}
                {field.storage ? ` · ${field.storage.format.toUpperCase()} ready` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Integration flow</p>
            <h2>How this plugs into the site</h2>
          </div>
        </div>
        <ol className="ordered-list">
          {wind.integrationPlan.recommendedFlow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          Target routes: {wind.integrationPlan.appTargets.join(", ")}
        </p>
      </section>
    </div>
  );
}
