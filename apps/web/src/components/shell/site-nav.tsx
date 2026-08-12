"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

interface NavLink {
  href: string;
  label: string;
  prefixes: string[];
}

const PRIMARY_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", prefixes: ["/"] },
  { href: "/replay", label: "Replay", prefixes: ["/replay", "/compare", "/stints", "/sessions"] },
  { href: "/learn", label: "Learn", prefixes: ["/learn"] },
  { href: "/cars/current-spec", label: "Modelview", prefixes: ["/cars"] },
];

const SECONDARY_LINKS: NavLink[] = [
  { href: "/race-desk", label: "Historical Race Desk", prefixes: ["/race-desk", "/live"] },
];

function matches(pathname: string | null, link: NavLink) {
  if (!pathname) return false;
  return link.prefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function SiteNav() {
  const pathname = usePathname();

  const renderLinks = useMemo(() => {
    return (links: NavLink[]) =>
      links.map((link) => {
        const active = matches(pathname, link);
        return (
          <a
            key={link.href}
            href={link.href}
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </a>
        );
      });
  }, [pathname]);

  return (
    <div className="site-header__navs">
      <nav className="site-nav site-nav--primary" aria-label="Primary">
        {renderLinks(PRIMARY_LINKS)}
      </nav>
      <nav className="site-nav site-nav--secondary" aria-label="Reference">
        {renderLinks(SECONDARY_LINKS)}
      </nav>
    </div>
  );
}
