import { Suspense } from "react";
import { CarModelBrowser } from "@/components/model-viewer/car-model-browser";
import { getCarModelCatalog } from "@/lib/data";

export default async function CarModelPage() {
  const catalog = await getCarModelCatalog();

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Modelview</p>
        <h1>Rotate the car, switch constructors, and hold the engineering story in one frame.</h1>
        <p className="lead">
          Select a season and constructor to load the GLB. Orbit, zoom, and use this studio view as the
          anchor before jumping into learn modules or replay.
        </p>
      </section>

      <Suspense fallback={<div className="panel">Loading model...</div>}>
        <CarModelBrowser catalog={catalog} />
      </Suspense>
    </div>
  );
}
