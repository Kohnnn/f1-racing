import { Suspense } from "react";
import { CarModelBrowser } from "@/components/model-viewer/car-model-browser";
import { getCarModelCatalog, getWindOverlaySchemaExample } from "@/lib/data";

export default async function CarModelPage() {
  const [catalog, overlaySchema] = await Promise.all([getCarModelCatalog(), getWindOverlaySchemaExample()]);

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Car surface</p>
        <h1>Use `model-viewer` as the dedicated GLB page, not the whole telemetry app.</h1>
        <p className="lead">
          This page is the right place for constructor and season model selection, hotspots, and later CFD-linked
          overlays. It should stay separate from lap-compare and stint pages so 3D does not become the default load
          path everywhere else.
        </p>
      </section>

      <Suspense fallback={<div className="panel">Loading car surface...</div>}>
        <CarModelBrowser catalog={catalog} overlaySchema={overlaySchema} />
      </Suspense>
    </div>
  );
}
