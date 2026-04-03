import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 Racing",
  description: "Formula 1 replay, modelview, and engineering learning built on static race packs.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="site-header">
            <a className="brand" href="/">
              <span className="brand__eyebrow">Replay · Modelview · Learn</span>
              <strong>F1 Racing</strong>
            </a>
            <nav className="site-nav">
              <a href="/cars/current-spec">Modelview</a>
              <a href="/replay">Replay</a>
              <a href="/learn">Learn</a>
              <a href="/sessions">Sessions</a>
              <a href="/compare/2025/australian-grand-prix/qualifying/NOR/PIA">Compare</a>
              <a href="/stints/2025/australian-grand-prix/qualifying">Stints</a>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
