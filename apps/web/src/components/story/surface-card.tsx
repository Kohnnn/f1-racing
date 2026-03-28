import type { ReactNode } from "react";

interface SurfaceCardProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  href?: string;
}

export function SurfaceCard({ eyebrow, title, children, href }: SurfaceCardProps) {
  const content = (
    <article className="panel surface-card">
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{children}</p>
      {href ? <span className="surface-card__link">Open {title.toLowerCase()} {"->"}</span> : null}
    </article>
  );

  return href ? <a className="surface-card__anchor" href={href}>{content}</a> : content;
}
