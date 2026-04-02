import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 Racing",
  description: "Static-first Formula 1 telemetry and explainer product scaffold.",
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
              <span className="brand__eyebrow">Telemetry product</span>
              <strong>F1 Racing</strong>
            </a>
            <nav className="site-nav">
              <a href="/sessions">Sessions</a>
              <a href="/compare/2025/australian-grand-prix/qualifying/NOR/PIA">Compare</a>
              <a href="/stints/2025/australian-grand-prix/qualifying">Stints</a>
              <a href="/cars/current-spec">Cars</a>
              <a href="/sims/wind">Wind</a>
              <a href="/learn">Learn</a>
              <a href="/">Architecture</a>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
