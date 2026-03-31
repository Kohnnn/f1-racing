import { FlowCompareView } from "@/components/flow/flow-compare-view";
import { getFlowCarRegistry } from "@/lib/data";

export default async function WindComparePage() {
  const registry = await getFlowCarRegistry();
  const cars = registry.cars;

  if (cars.length < 2) {
    return (
      <div className="page-stack">
        <section className="hero hero--compact">
          <p className="eyebrow">Side-by-side compare</p>
          <h1>Not enough cars registered for compare.</h1>
          <p className="lead">Add at least two cars to the flow registry to use this view.</p>
        </section>
      </div>
    );
  }

  const [carA, carB] = cars;

  return (
    <div className="page-stack">
      <section className="hero flow-hero">
        <p className="eyebrow">Projected flow compare</p>
        <h1>Two cars, one shared solver box — see the wake difference.</h1>
        <p className="lead">
          Both the {carA.name} and the {carB.name} are rendered under identical solver conditions: same
          grid, same inflow speed, same metric math. The compare is fair because the framing never changes.
        </p>
        <div className="hero-actions">
          <a className="button" href="/sims/wind/">Open single-car view</a>
          <a className="button button--secondary" href={`/cars/current-spec?season=${carA.year}&constructor=${carA.constructorSlug}`}>
            Open {carA.name} viewer
          </a>
          <a className="button button--secondary" href={`/cars/current-spec?season=${carB.year}&constructor=${carB.constructorSlug}`}>
            Open {carB.name} viewer
          </a>
        </div>
      </section>

      <FlowCompareView cars={cars} />

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">How the compare works</p>
            <h2>Same solver box, swapped silhouette</h2>
          </div>
        </div>
        <p>
          The compare keeps the D2Q9 LBM grid, inflow speed, and metric math constant while substituting only
          the car's top-view silhouette mask. Wake width, wake length, wake area, and the drag proxy are all
          computed the same way — what changes is the shape underneath.
        </p>
        <ul className="summary-list">
          <li><strong>Grid</strong><span>{carA.topMaskPath}</span></li>
          <li><strong>Car A</strong><span>{carA.name} · {carA.era}</span></li>
          <li><strong>Car B</strong><span>{carB.name} · {carB.era}</span></li>
          <li><strong>Note</strong><span>Relative metrics only — this is not real CFD or a race-team tool.</span></li>
        </ul>
      </section>
    </div>
  );
}
