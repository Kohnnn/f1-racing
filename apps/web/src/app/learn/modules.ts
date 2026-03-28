export const learnModules = [
  {
    slug: "car",
    title: "Car",
    description: "Exploded car overview, main component families, and how the packaging should map to later hotspot and CFD surfaces.",
    body: [
      "Use this module to explain what each major system on the car is responsible for before telemetry or strategy is introduced.",
      "This page should stay explanation-first and link outward to `/cars/current-spec` for the heavier GLB surface.",
    ],
    nextLinks: [
      { href: "/cars/current-spec", label: "Open current-spec car surface" },
      { href: "/learn/aero", label: "Continue to aero" },
    ],
  },
  {
    slug: "aero",
    title: "Aero",
    description: "Airflow, dirty air, floor loading, diffuser recovery, and rear wing tradeoffs using precomputed or baked sim-ready assets.",
    body: [
      "This module is where OpenFOAM-derived or other baked CFD overlays should eventually be connected back into the learning flow.",
      "Use it to bridge the current explainer concepts with the wind-sim and model-viewer surfaces instead of mixing everything into one page.",
    ],
    nextLinks: [
      { href: "/sims/wind", label: "Open wind surface" },
      { href: "/learn/tyres", label: "Continue to tyres" },
    ],
  },
  {
    slug: "tyres",
    title: "Tyres",
    description: "Compound windows, load sensitivity, stint fade, crossover logic, and degradation stories.",
    body: [
      "Keep this page focused on grip, temperature, wear, and crossover decisions rather than generic car overview content.",
      "It should eventually feed the stint and strategy product surfaces with shared concepts and language.",
    ],
    nextLinks: [
      { href: "/sessions/2025/australian-grand-prix/qualifying", label: "Open a real session pack" },
      { href: "/learn/braking", label: "Continue to braking" },
    ],
  },
  {
    slug: "braking",
    title: "Braking",
    description: "Brake points, weight transfer, energy recovery, and entry confidence as explanation modules.",
    body: [
      "Use this module to connect the driver-facing feeling of braking to the telemetry-facing measures you show on compare pages.",
      "It is a good candidate for later corner-level overlays because brake point and minimum speed are already derivable from telemetry packs.",
    ],
    nextLinks: [
      { href: "/compare/2025/australian-grand-prix/qualifying/NOR/PIA", label: "Open compare surface" },
      { href: "/learn/setup", label: "Continue to setup" },
    ],
  },
  {
    slug: "setup",
    title: "Setup",
    description: "Track-dependent compromises for wing, ride, stiffness, brake balance, and tyre choice.",
    body: [
      "This page should eventually connect static explanation cards with track presets, compare summaries, and replay-lite overlays.",
      "The main goal is to explain why no setup is universally best across circuits and conditions.",
    ],
    nextLinks: [
      { href: "/sessions", label: "Open session explorer" },
      { href: "/learn/strategy", label: "Continue to strategy" },
    ],
  },
  {
    slug: "strategy",
    title: "Strategy",
    description: "Weather, pit loss, undercut and overcut windows, safety-car timing, and race engineering context.",
    body: [
      "This module should tie weather, tyre state, and pit timing back into the telemetry and replay surfaces.",
      "It is also the natural home for future pit-wall storytelling and race-control overlays.",
    ],
    nextLinks: [
      { href: "/sims/wind", label: "Review wind and CFD prep" },
      { href: "/compare/2025/australian-grand-prix/qualifying/NOR/PIA", label: "Return to compare" },
    ],
  },
] as const;

export type LearnModule = (typeof learnModules)[number];

export function getLearnModule(slug: string) {
  return learnModules.find((module) => module.slug === slug);
}
