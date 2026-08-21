"use client";

import type { ReactNode } from "react";
import { saveApprovedBriefInBrowser, type LearningTrailInput } from "@/lib/learning-trail";

interface DashboardHandoffProps {
  children: ReactNode;
  className?: string;
  href: string;
  trail: LearningTrailInput;
}

export function DashboardHandoff({ children, className, href, trail }: DashboardHandoffProps) {
  return (
    <a className={className} href={href} onClick={() => saveApprovedBriefInBrowser(trail)}>
      {children}
    </a>
  );
}
