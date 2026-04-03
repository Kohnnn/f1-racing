import { notFound } from "next/navigation";
import { SurfaceCard } from "@/components/story/surface-card";
import { getLearnModule, learnModules } from "../modules";

interface LearnModulePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return learnModules.map((module) => ({ slug: module.slug }));
}

export default async function LearnModulePage({ params }: LearnModulePageProps) {
  const { slug } = await params;
  const module = getLearnModule(slug);

  if (!module) {
    notFound();
  }

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <p className="eyebrow">Learn module</p>
        <h1>{module.title}</h1>
        <p className="lead">{module.description}</p>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Core concepts</p>
            <h2>Key points</h2>
          </div>
        </div>
        <ol className="ordered-list">
          {module.body.map((paragraph, i) => (
            <li key={i}>{paragraph}</li>
          ))}
        </ol>
      </section>

      <section className="panel-grid panel-grid--two">
        {module.nextLinks.map((link) => (
          <SurfaceCard
            key={link.href}
            eyebrow="Continue"
            title={link.label}
            href={link.href}
            ctaLabel="Navigate ->"
            tone="learn"
          >
            Move straight from this module into the next surface without going back through the landing page.
          </SurfaceCard>
        ))}
      </section>
    </div>
  );
}
