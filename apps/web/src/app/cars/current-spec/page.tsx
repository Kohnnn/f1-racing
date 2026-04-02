import { Suspense } from "react";
import { CarModelBrowser } from "@/components/model-viewer/car-model-browser";
import { getCarModelCatalog } from "@/lib/data";

export default async function CarModelPage() {
  const catalog = await getCarModelCatalog();

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Car surface</p>
        <h1>Rotate and explore F1 car models in 3D.</h1>
        <p className="lead">
          Select a season and constructor to load the GLB. Camera controls are enabled — drag to orbit,
          scroll to zoom. More models will be added as lightweight GLBs become available.
        </p>
      </section>

      <Suspense fallback={<div className="panel">Loading model...</div>}>
        <CarModelBrowser catalog={catalog} />
      </Suspense>
    </div>
  );
}
