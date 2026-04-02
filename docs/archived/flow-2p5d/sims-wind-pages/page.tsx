import { ProjectedFlowLab } from "@/components/flow/projected-flow-lab";
import { getFlowCarRegistry } from "@/lib/data";

export default async function WindSimPage() {
  const registry = await getFlowCarRegistry();
  const featuredCar = registry.cars.find((car) => car.id === "mcl39-style") ?? registry.cars[0];
  const availableCars = registry.cars.map((car) => car.name).join(" and ");

  if (!featuredCar) {
    return <div className="panel">No projected-flow cars are registered yet.</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero flow-hero">
        <p className="eyebrow">Projected flow surface</p>
        <h1>Render the MCL39 in 3D and explain its wake with a repeatable 2.5D flow field.</h1>
        <p className="lead">
          This route pairs the real McLaren `GLB` with a derived top-view mask and a lightweight projected-flow solver.
          It is built for your blog: clear visuals, repeatable metrics, and a workflow you can reuse when you add more
          F1 eras. The registry currently ships with {availableCars} under the same solver framing.
        </p>
        <div className="hero-actions">
          <a className="button" href={featuredCar.publicModelPath}>Open raw GLB asset</a>
          <a className="button button--secondary" href="/cars/current-spec?season=2025&constructor=mclaren">Open car viewer</a>
          <a className="button button--secondary" href={featuredCar.topMaskPath}>Open derived top mask</a>
        </div>
      </section>

      <ProjectedFlowLab cars={registry.cars} defaultCarId={featuredCar.id} />

      <section className="panel flow-pipeline-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Repeatable workflow</p>
            <h2>How to add the next era after the MCL39</h2>
          </div>
        </div>
        <ol className="ordered-list">
          <li>Prepare one display `GLB` and one simplified top-view mask for the new car.</li>
          <li>Keep the same top-view framing, orientation, and registry schema.</li>
          <li>Reuse the same grid, speed presets, and relative metric formulas.</li>
          <li>Compare cars by wake width, wake length, wake area, and drag proxy rather than CFD coefficients.</li>
        </ol>
        <p>
          Registered cars live in a shared manifest and point to public `GLB`, `top-mask`, and preview assets. The
          current registry already proves the surface can swap between two different 2025 cars without changing the
          solver rules.
        </p>
      </section>
    </div>
  );
}
