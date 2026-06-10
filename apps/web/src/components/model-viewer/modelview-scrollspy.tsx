"use client";

import { useEffect, useState, type MouseEvent } from "react";

export interface ScrollSpySection {
  id: string;
  label: string;
}

interface ModelviewScrollSpyProps {
  sections: ScrollSpySection[];
}

export function ModelviewScrollSpy({ sections }: ModelviewScrollSpyProps) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }

    const visibility = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const section of sections) {
          const ratio = visibility.get(section.id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = section.id;
          }
        }
        if (bestId) {
          setActiveId(bestId);
        }
      },
      {
        rootMargin: "-15% 0px -35% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );

    const observed: Element[] = [];
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) {
        observer.observe(element);
        observed.push(element);
      }
    }

    return () => {
      for (const element of observed) {
        observer.unobserve(element);
      }
      observer.disconnect();
    };
  }, [sections]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }
    event.preventDefault();
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  }

  if (sections.length === 0) {
    return null;
  }

  return (
    <nav className="modelview-scrollspy" aria-label="Page sections">
      <ul className="modelview-scrollspy__list">
        {sections.map((section) => {
          const isActive = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className={`modelview-scrollspy__link${isActive ? " modelview-scrollspy__link--active" : ""}`}
                aria-current={isActive ? "true" : undefined}
                onClick={(event) => handleClick(event, section.id)}
              >
                <span className="modelview-scrollspy__dot" aria-hidden="true" />
                <span className="modelview-scrollspy__label">{section.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
