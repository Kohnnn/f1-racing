import { notFound } from "next/navigation";
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
            <p className="eyebrow">Module plan</p>
            <h2>What this page should explain</h2>
          </div>
        </div>
        <div className="summary-list">
          {module.body.map((paragraph) => (
            <div className="summary-list__static" key={paragraph}>
              <span>{paragraph}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel-grid panel-grid--two">
        {module.nextLinks.map((link) => (
          <a className="panel surface-card surface-card__anchor" href={link.href} key={link.href}>
            <p className="eyebrow">Next link</p>
            <h3>{link.label}</h3>
            <p>Use this route when you want to move from explanation into a more specialized product surface.</p>
            <span className="surface-card__link">Open route -&gt;</span>
          </a>
        ))}
      </section>
    </div>
  );
}
