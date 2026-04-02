export const learnModules = [
  {
    slug: "car",
    title: "Car",
    description: "Exploded car overview: power unit, chassis, aero surfaces, suspension, and tyres — and how they work together.",
    body: [
      "An F1 car is a packaging exercise as much as an engineering one. Every component must fit within the regulated envelope while maximizing aerodynamic efficiency and weight distribution.",
      "The car is built around the survival cell — a carbon fiber monocoque that protects the driver and provides the structural backbone for all other systems.",
      "Six key component families: power unit (ICE + hybrid systems), chassis (monocoque + bodywork), front/rear suspension, aero surfaces (wings + floor), brakes, and tyres.",
    ],
    nextLinks: [
      { href: "/cars/current-spec", label: "View 3D car model" },
      { href: "/learn/aero", label: "Continue to aero" },
    ],
  },
  {
    slug: "aero",
    title: "Aero",
    description: "How airflow over and under the car generates downforce, reduces drag, and shapes the racing line.",
    body: [
      "Downforce lets F1 cars corner at speeds that would be impossible with tyre grip alone. At high speed, an F1 car produces enough downforce to drive upside down.",
      "The front wing initiates the airflow — it directs clean air around the tires and shapes the flow that reaches the floor and rear wing.",
      "The floor and diffuser work as a venturi: the converging channel accelerates air underneath, creating low pressure that sucks the car toward the track.",
      "Dirty air behind the car disrupts following cars' aero — this is why overtaking is harder than leading.",
    ],
    nextLinks: [
      { href: "/learn/tyres", label: "Continue to tyres" },
      { href: "/learn/braking", label: "Continue to braking" },
    ],
  },
  {
    slug: "tyres",
    title: "Tyres",
    description: "Compound windows, degradation curves, stint strategy, and the physics of tyre grip.",
    body: [
      "F1 tyres are the only contact patch between car and track. Every change in direction, speed, or temperature is communicated through those four patches.",
      "Five dry compounds: C0 (hardest) through C5 (softest). Higher numbers generate more grip but degrade faster. Teams pick based on track characteristics and race strategy.",
      "Tyre temperature is critical — too cold and grip is low, too hot and the rubber graining or blistering destroys performance. The optimal window is narrow and varies by compound.",
      "A typical race stint starts with peak grip (fresh tyre), transitions through a plateau (optimal working range), then drops off as the rubber wears and the underlying carcass overheats.",
    ],
    nextLinks: [
      { href: "/learn/braking", label: "Continue to braking" },
      { href: "/learn/strategy", label: "Continue to strategy" },
    ],
  },
  {
    slug: "braking",
    title: "Braking",
    description: "Brake energy recovery, weight transfer, heat management, and the drivers perspective on brake zones.",
    body: [
      "F1 brakes are carbon-carbon — they weigh about 1/10th of steel brakes and can handle temperatures exceeding 1000°C. They are the most energy-dense brakes in motorsport.",
      "Braking also charges the hybrid system. Under deceleration, the MGU-K harvests up to 200kW of electrical energy that drivers deploy later for extra power.",
      "Weight transfer during braking shifts load to the front axle — the front brakes do 60-65% of total braking work. Brake balance is adjusted to prevent front lock-ups or rear instability.",
      "From the driver's POV, a typical braking zone involves threshold braking (at the limit of tyre grip), sometimes preceded by lift-and-parse to manage rear stability and charge the battery.",
    ],
    nextLinks: [
      { href: "/learn/setup", label: "Continue to setup" },
      { href: "/learn/tyres", label: "Return to tyres" },
    ],
  },
  {
    slug: "setup",
    title: "Setup",
    description: "Track-dependent compromises: wing angle, ride height, suspension stiffness, and brake bias.",
    body: [
      "No setup is universally fastest. Every circuit demands different compromises between downforce, drag, tyre wear, and drivability.",
      "Front wing angle (rake) sets the car's aero balance — more rake loads the front floor for improved diffuser effect but can reduce rear stability.",
      "Suspension geometry and stiffness affect how the car reacts to kerbs, bumps, and weight transfer. Monaco demands compliance; Spa demands precision.",
      "Brake bias and power steering calibration also shift with track — high downforce circuits need more rearward bias to balance the aero loads.",
    ],
    nextLinks: [
      { href: "/learn/strategy", label: "Continue to strategy" },
      { href: "/sessions", label: "Explore session data" },
    ],
  },
  {
    slug: "strategy",
    title: "Strategy",
    description: "Pit windows, undercut/overcut logic, weather variables, and the role of race engineers.",
    body: [
      "F1 strategy revolves around tyre degradation and pit loss — the 20-25 second pit stop cost must be offset by a significant tyre advantage.",
      "An undercut (pitting before your rival) is most effective when fresh tyres give a large pace delta — drivers can gain 2-3 seconds per lap on worn tyres ahead.",
      "An overcut (pitting after your rival) leverages clean air — without dirty air disrupting airflow, fresh tyres cool and work more effectively in the early laps.",
      "Weather introduces chaos: a sudden rain shower can nullify an entire strategic plan, creating opportunities for teams that read the conditions correctly.",
    ],
    nextLinks: [
      { href: "/sessions", label: "Explore sessions" },
      { href: "/learn/car", label: "Return to car overview" },
    ],
  },
] as const;

export type LearnModule = (typeof learnModules)[number];

export function getLearnModule(slug: string) {
  return learnModules.find((module) => module.slug === slug);
}
