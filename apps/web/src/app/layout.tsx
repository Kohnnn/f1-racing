import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteNav } from "@/components/shell/site-nav";

export const metadata: Metadata = {
  metadataBase: new URL("https://f1-demo.netlify.app"),
  title: {
    default: "F1 Racing",
    template: "%s · F1 Racing",
  },
  description: "Formula 1 replay, modelview, and engineering learning built on static race packs.",
  openGraph: {
    siteName: "F1 Racing",
    type: "website",
    locale: "en_US",
    url: "/",
    title: "F1 Racing",
    description: "Formula 1 replay, modelview, and engineering learning built on static race packs.",
  },
  twitter: {
    card: "summary",
  },
  robots: {
    index: true,
    follow: true,
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
          <main id="top">{children}</main>
          <footer>
            <nav aria-label="Legal">
              <a href="/privacy">Privacy</a>
            </nav>
          </footer>
        </div>
        <a href="#top" className="scroll-to-top" aria-label="Scroll to top">↑</a>
      </body>
    </html>
  );
}
