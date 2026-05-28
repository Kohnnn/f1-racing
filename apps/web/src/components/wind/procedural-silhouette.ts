/**
 * Procedural F1 silhouette builder (2026-05-24).
 *
 * Returns a closed polygon (normalised 0..1, x = forward, y = up-on-canvas
 * with y=0 at the top) that traces a side view of a current-spec F1 car.
 * The proportions match real F1 chassis at roughly 3:1 length-to-height:
 *
 *   - front wing endplate → nose tip
 *   - low nose → front-wing pylons
 *   - airbox / halo crest above the cockpit
 *   - sidepod inlet undercut
 *   - shark fin / engine cover slope
 *   - rear wing main plane + endplate
 *   - low diffuser / floor edge
 *   - two wheel cutouts at canonical wheelbase
 *
 * The polygon is parameterized so we can apply per-constructor accent
 * colours and (optionally) DRS / front-wing-flap variations later.
 */

export interface ProceduralSilhouetteOptions {
  /** Pull or push the rear wing height (0..1 normalised). */
  rearWingHeight?: number;
  /** Pull or push the nose / front-wing tip height. */
  noseHeight?: number;
  /** Flatten the rear wing and trim drag-sensitive surface area. */
  drsOpen?: boolean;
  /** Visual accent for the team's primary colour. */
  accentColor?: string;
}

export interface ProceduralSilhouette {
  polygon: Array<[number, number]>;
  wheelArches: Array<{ cx: number; cy: number; r: number }>;
  /** Decorative auxiliary paths (front wing, floor edge, halo). */
  details: Array<{ kind: "halo" | "frontWing" | "floor" | "rearWing" | "stripe"; points: Array<[number, number]> }>;
  aspect: number;
}

/**
 * Hand-tuned canonical proportions for a 2025-spec F1 car. All coordinates
 * are in normalised x in [0,1] (nose at x≈0.04, tail at x≈0.96) with y in
 * [0,1] (top at y=0, floor at y≈0.92).
 */
export function buildProceduralSilhouette(options: ProceduralSilhouetteOptions = {}): ProceduralSilhouette {
  const accent = options.accentColor ?? "#ff7a1a";
  const drsTrim = options.drsOpen ? 0.075 : 0;
  const rwHeight = clamp((options.rearWingHeight ?? 0.32) + drsTrim, 0.18, 0.48);
  const rearWingUnderside = options.drsOpen ? rwHeight + 0.10 : rwHeight + 0.18;
  const noseHeight = clamp(options.noseHeight ?? 0.74, 0.62, 0.84);

  // Top profile (front to back): the upper silhouette traced from the
  // front-wing tip rearwards, over the nose, halo, airbox, engine cover,
  // and rear wing.
  const top: Array<[number, number]> = [
    [0.04, 0.78],                  // front-wing endplate top
    [0.07, 0.84],                  // wing pylon
    [0.10, noseHeight + 0.02],     // top of nose tip
    [0.18, noseHeight - 0.04],     // nose plateau
    [0.26, noseHeight - 0.08],     // nose-to-chassis transition
    [0.31, noseHeight - 0.12],     // monocoque front bulkhead
    [0.36, 0.50],                  // bottom of cockpit opening (top of side intrusion structure)
    [0.40, 0.42],                  // halo front pillar base
    [0.42, 0.32],                  // halo arc front
    [0.46, 0.26],                  // halo arc apex
    [0.50, 0.30],                  // halo arc rear
    [0.54, 0.40],                  // airbox front
    [0.58, 0.34],                  // airbox crest
    [0.66, 0.38],                  // engine cover apex
    [0.76, 0.46],                  // engine cover taper
    [0.82, 0.52],                  // pre-rear-wing dip
    [0.86, 0.54],                  // rear deck
    [0.88, rwHeight + 0.10],       // rear wing front pillar
    [0.91, rwHeight],              // rear wing main plane top
    [0.95, rwHeight + 0.04],       // rear wing endplate top
    [0.96, rwHeight + 0.10],       // rear wing tip
  ];

  // Bottom profile (back to front): rear-wing endplate -> floor edge ->
  // diffuser -> front wing main plane -> wing endplate base.
  const bottom: Array<[number, number]> = [
    [0.96, rearWingUnderside],      // rear wing exit underside
    [0.95, 0.74],                  // rear floor exit
    [0.90, 0.84],                  // diffuser entry
    [0.83, 0.88],                  // floor mid
    [0.74, 0.90],                  // floor edge under sidepod exit
    [0.62, 0.91],                  // floor under sidepod
    [0.50, 0.91],                  // floor under cockpit
    [0.38, 0.91],                  // floor under fuel cell
    [0.28, 0.90],                  // floor under nose
    [0.20, 0.88],                  // splitter
    [0.14, 0.86],                  // bargeboard area
    [0.10, 0.84],                  // front wing main plane
    [0.07, 0.84],                  // front wing endplate base
    [0.04, 0.82],                  // wing tip base
  ];

  const polygon: Array<[number, number]> = [...top, ...bottom];

  // Sidepod inlet cut-out -- drawn separately as a detail line because
  // representing it in the closed polygon would create a self-intersection.
  // Instead the renderer can subtract the shaded region.

  // Wheels: front + rear wheelbase at canonical proportions.
  const wheelArches = [
    { cx: 0.20, cy: 0.84, r: 0.075 },
    { cx: 0.78, cy: 0.84, r: 0.075 },
  ];

  const details: ProceduralSilhouette["details"] = [
    {
      kind: "halo",
      points: [
        [0.42, 0.32],
        [0.46, 0.26],
        [0.50, 0.30],
      ],
    },
    {
      kind: "frontWing",
      points: [
        [0.02, 0.84],
        [0.10, 0.84],
        [0.14, 0.86],
      ],
    },
    {
      kind: "rearWing",
      points: [
        [0.86, options.drsOpen ? rwHeight + 0.08 : rwHeight + 0.12],
        [0.91, rwHeight],
        [0.96, options.drsOpen ? rwHeight + 0.02 : rwHeight + 0.06],
      ],
    },
    {
      kind: "floor",
      points: [
        [0.10, 0.92],
        [0.94, 0.92],
      ],
    },
    {
      kind: "stripe",
      points: [
        [0.20, noseHeight - 0.06],
        [0.40, 0.44],
        [0.62, 0.36],
        [0.80, 0.50],
      ],
    },
  ];

  return {
    polygon,
    wheelArches,
    details,
    aspect: 3.05,
  };

  function clamp(x: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, x));
  }
}

export interface AirfoilSilhouetteOptions {
  angleDeg?: number;
}

/**
 * NACA 2412-inspired section for validating angle-of-attack and probe flow
 * inside the same wind-tunnel solver used by the F1 silhouette.
 */
export function buildAirfoilSilhouette(options: AirfoilSilhouetteOptions = {}): ProceduralSilhouette {
  const angleRad = ((options.angleDeg ?? 0) * Math.PI) / 180;
  const camber = 0.02;
  const camberPos = 0.4;
  const thickness = 0.12;
  const upper: Array<[number, number]> = [];
  const lower: Array<[number, number]> = [];
  const camberLine: Array<[number, number]> = [];

  for (let i = 0; i <= 54; i += 1) {
    const x = i / 54;
    const yt = 5 * thickness * (
      0.2969 * Math.sqrt(Math.max(0, x))
      - 0.1260 * x
      - 0.3516 * x ** 2
      + 0.2843 * x ** 3
      - 0.1015 * x ** 4
    );
    const yc = x < camberPos
      ? (camber / camberPos ** 2) * (2 * camberPos * x - x ** 2)
      : (camber / (1 - camberPos) ** 2) * ((1 - 2 * camberPos) + 2 * camberPos * x - x ** 2);
    const dyc = x < camberPos
      ? (2 * camber / camberPos ** 2) * (camberPos - x)
      : (2 * camber / (1 - camberPos) ** 2) * (camberPos - x);
    const theta = Math.atan(dyc);
    upper.push(rotatePoint(x - yt * Math.sin(theta), yc + yt * Math.cos(theta), -angleRad));
    lower.push(rotatePoint(x + yt * Math.sin(theta), yc - yt * Math.cos(theta), -angleRad));
    camberLine.push(rotatePoint(x, yc, -angleRad));
  }

  const normalized = normalizeAirfoil([...upper, ...lower.reverse()]);
  const normalizedCamber = normalizeAirfoil(camberLine, normalized.bounds);

  return {
    polygon: normalized.points,
    wheelArches: [],
    details: [
      {
        kind: "stripe",
        points: normalizedCamber.points,
      },
    ],
    aspect: 4.8,
  };
}

function rotatePoint(x: number, y: number, angleRad: number): [number, number] {
  const pivotX = 0.25;
  const pivotY = 0;
  const dx = x - pivotX;
  const dy = y - pivotY;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return [pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos];
}

function normalizeAirfoil(points: Array<[number, number]>, existingBounds?: { minX: number; maxX: number; minY: number; maxY: number }) {
  const bounds = existingBounds ?? points.reduce(
    (acc, [x, y]) => ({
      minX: Math.min(acc.minX, x),
      maxX: Math.max(acc.maxX, x),
      minY: Math.min(acc.minY, y),
      maxY: Math.max(acc.maxY, y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;
  const yPad = Math.max(0.18, spanY * 0.8);
  const yMin = bounds.minY - yPad;
  const yMax = bounds.maxY + yPad;
  const normalizedYSpan = yMax - yMin || 1;
  return {
    bounds,
    points: points.map(([x, y]) => [
      0.03 + ((x - bounds.minX) / spanX) * 0.94,
      0.5 - ((y - (yMin + normalizedYSpan * 0.5)) / normalizedYSpan) * 0.82,
    ] as [number, number]),
  };
}
