import { notFound } from "next/navigation";
import { SurfaceCard } from "@/components/story/surface-card";
import { LearnModelEmbed } from "@/components/story/learn-model-embed";
import { LearnModuleProgress } from "@/components/story/learn-module-progress";
import { getLearnModule, learnModules } from "../modules";

interface LearnModulePageProps {
  params: Promise<{
    slug: string;
  }>;
}

const MODULE_MODEL_EMBED: Record<string, { modelSrc: string; modelTitle: string; modelScale?: string; cameraOrbit?: string; cameraTarget?: string; caption: string }> = {
  car: {
    modelSrc: "/models/2025/red-bull/rb21.glb",
    modelTitle: "Red Bull RB21",
    modelScale: "100 100 100",
    cameraOrbit: "30deg 75deg 8.8m",
    cameraTarget: "0m 0.48m 0m",
    caption: "Drag to orbit. The full chassis sits in front of you.",
  },
  aero: {
    modelSrc: "/models/2025/mclaren/mcl39.glb",
    modelTitle: "McLaren MCL39",
    cameraOrbit: "10deg 78deg 2.4m",
    cameraTarget: "0m 0.2m 0m",
    caption: "Look at the sidepod undercut and floor edges as you orbit.",
  },
  setup: {
    modelSrc: "/models/2025/ferrari/sf25.glb",
    modelTitle: "Ferrari SF-25",
    cameraOrbit: "0deg 8deg 2.7m",
    cameraTarget: "0m 0.15m 0m",
    caption: "Top-down view to read planform and packaging balance.",
  },
};

export async function generateStaticParams() {
  return learnModules.map((module) => ({ slug: module.slug }));
}

export async function generateMetadata({ params }: LearnModulePageProps) {
  const { slug } = await params;
  const module = getLearnModule(slug);
  if (!module) {
    return { title: slug };
  }
  return {
    title: module.title,
    description: module.description,
  };
}

export default async function LearnModulePage({ params }: LearnModulePageProps) {
  const { slug } = await params;
  const module = getLearnModule(slug);

  if (!module) {
    notFound();
  }

  const embed = MODULE_MODEL_EMBED[slug];

  return (
    <div className="page-stack learn-module-page">
      <section className="hero hero--compact">
        <p className="eyebrow">Learn module</p>
        <h1>{module.title}</h1>
        <p className="lead">{module.description}</p>
        <LearnModuleProgress slug={slug} title={module.title} />
      </section>

      {embed ? (
        <section className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Inline 3D model</p>
              <h2>Inspect while you read</h2>
            </div>
          </div>
          <LearnModelEmbed
            modelSrc={embed.modelSrc}
            modelTitle={embed.modelTitle}
            modelScale={embed.modelScale}
            cameraOrbit={embed.cameraOrbit}
            cameraTarget={embed.cameraTarget}
            caption={embed.caption}
          />
        </section>
      ) : null}

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
        <div className="learn-module-page__footer">
          <LearnModuleProgress slug={slug} title={module.title} />
        </div>
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
