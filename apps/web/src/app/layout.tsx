import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteNav } from "@/components/shell/site-nav";

export const metadata: Metadata = {
  title: {
    default: "F1 Racing",
    template: "%s · F1 Racing",
  },
  description: "Formula 1 replay, modelview, and engineering learning built on static race packs.",
  robots: {
    index: false,
    follow: false,
  },
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
            <SiteNav />
          </header>
          <main>{children}</main>
        </div>
        <a href="#top" className="scroll-to-top" aria-label="Scroll to top">↑</a>
      </body>
    </html>
  );
}
