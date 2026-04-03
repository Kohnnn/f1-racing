import type { ReactNode } from "react";

interface SurfaceCardProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  href?: string;
  ctaLabel?: string;
  meta?: string;
  items?: readonly string[];
  tone?: "neutral" | "model" | "replay" | "learn";
}

export function SurfaceCard({
  eyebrow,
  title,
  children,
  href,
  ctaLabel,
  meta,
  items = [],
  tone = "neutral",
}: SurfaceCardProps) {
  const content = (
    <article className={`panel surface-card surface-card--${tone}`}>
      <div className="surface-card__header">
        <p className="eyebrow">{eyebrow}</p>
        {meta ? <span className="surface-card__meta">{meta}</span> : null}
      </div>
      <h3>{title}</h3>
      <p className="surface-card__body">{children}</p>
      {items.length ? (
        <ul className="surface-card__list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {href ? <span className="surface-card__link">{ctaLabel || `Open ${title.toLowerCase()} ->`}</span> : null}
    </article>
  );

  return href ? <a className="surface-card__anchor" href={href}>{content}</a> : content;
}
