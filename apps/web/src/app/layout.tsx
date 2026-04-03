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
              <span className="brand__eyebrow">Replay-first F1 viewer</span>
              <strong>F1 Racing</strong>
            </a>
            <div className="site-header__navs">
              <nav className="site-nav site-nav--primary">
                <a href="/replay">Replay</a>
              </nav>
              <nav className="site-nav site-nav--secondary">
                <a href="/cars/current-spec">Modelview</a>
                <a href="/learn">Learn</a>
              </nav>
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
