export interface TrackPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface TrackMetrics {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface DenseTrackPoint extends TrackPoint {
  distance: number;
  nx: number;
  ny: number;
}

export interface TrackGeometry {
  points: TrackPoint[];
  densePoints: DenseTrackPoint[];
  totalLength: number;
  metrics: TrackMetrics;
  toScreen: (point: TrackPoint) => ScreenPoint;
  project: (point: TrackPoint) => { distance: number; point: TrackPoint; index: number };
  pointAtDistance: (distance: number) => DenseTrackPoint;
}

const DEFAULT_DENSE_POINTS = 2200;

function getBounds(points: TrackPoint[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, maxX, minY, maxY };
}

export function buildTrackMetrics(points: TrackPoint[], width: number, height: number): TrackMetrics | null {
  if (!points.length) {
    return null;
  }

  const { minX, maxX, minY, maxY } = getBounds(points);
  const padX = Math.max(28, width * 0.055);
  const padTop = Math.max(28, height * 0.06);
  const padBottom = Math.max(44, height * 0.1);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((width - padX * 2) / rangeX, (height - padTop - padBottom) / rangeY);
  const offsetX = padX + (width - padX * 2 - rangeX * scale) / 2;
  const offsetY = padTop + (height - padTop - padBottom - rangeY * scale) / 2;

  return { minX, maxX, minY, maxY, scale, offsetX, offsetY, width, height };
}

export function toScreen(point: TrackPoint, metrics: TrackMetrics): ScreenPoint {
  return {
    x: metrics.offsetX + (point.x - metrics.minX) * metrics.scale,
    y: metrics.offsetY + (metrics.maxY - point.y) * metrics.scale,
  };
}

function interpolateTrack(points: TrackPoint[], targetCount = DEFAULT_DENSE_POINTS): DenseTrackPoint[] {
  if (points.length < 2) {
    return points.map((point) => ({ ...point, distance: 0, nx: 0, ny: -1 }));
  }

  // Winding direction (for outward normals), computed from the raw control loop.
  let signedArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    signedArea += current.x * next.y - next.x * current.y;
  }
  const normalDirection = signedArea > 0 ? -1 : 1;

  // Treat the racing line as a closed loop and smooth it with a centripetal
  // Catmull-Rom spline. Centripetal parameterisation (alpha = 0.5) avoids the
  // cusps and self-intersections plain uniform Catmull-Rom produces on the
  // tight, unevenly-spaced control points exported for each circuit. We first
  // oversample the spline finely, then resample by arc length so markers move
  // at a consistent speed and projection stays accurate.
  const closed = points.length > 2;
  const last = points.length - 1;
  const get = (i: number): TrackPoint => {
    if (closed) return points[((i % points.length) + points.length) % points.length];
    return points[Math.max(0, Math.min(last, i))];
  };

  const ALPHA = 0.5;
  const SUB = 24; // samples per control segment before arc-length resample
  const fine: TrackPoint[] = [];
  const segCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segCount; i += 1) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);

    const t0 = 0;
    const t1 = t0 + Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), ALPHA) || t0 + 1e-4;
    const t2 = t1 + (Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), ALPHA) || 1e-4);
    const t3 = t2 + (Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y), ALPHA) || 1e-4);

    for (let s = 0; s < SUB; s += 1) {
      const t = t1 + ((t2 - t1) * s) / SUB;
      const a1x = lerpT(p0.x, p1.x, t0, t1, t);
      const a1y = lerpT(p0.y, p1.y, t0, t1, t);
      const a2x = lerpT(p1.x, p2.x, t1, t2, t);
      const a2y = lerpT(p1.y, p2.y, t1, t2, t);
      const a3x = lerpT(p2.x, p3.x, t2, t3, t);
      const a3y = lerpT(p2.y, p3.y, t2, t3, t);
      const b1x = lerpT(a1x, a2x, t0, t2, t);
      const b1y = lerpT(a1y, a2y, t0, t2, t);
      const b2x = lerpT(a2x, a3x, t1, t3, t);
      const b2y = lerpT(a2y, a3y, t1, t3, t);
      const cx = lerpT(b1x, b2x, t1, t2, t);
      const cy = lerpT(b1y, b2y, t1, t2, t);
      fine.push({ x: cx, y: cy });
    }
  }
  if (!closed) fine.push(points[last]);

  // Arc length along the fine spline.
  const fineCumulative = [0];
  for (let i = 1; i < fine.length; i += 1) {
    const d = Math.hypot(fine[i].x - fine[i - 1].x, fine[i].y - fine[i - 1].y);
    fineCumulative.push(fineCumulative[i - 1] + d);
  }
  const totalLength = fineCumulative.at(-1) || 1;
  const count = Math.max(points.length, targetCount);
  const densePoints: DenseTrackPoint[] = [];

  let cursor = 0;
  for (let sample = 0; sample < count; sample += 1) {
    const distance = (sample / (count - 1)) * totalLength;
    while (cursor < fine.length - 2 && fineCumulative[cursor + 1] < distance) cursor += 1;
    const start = fine[cursor];
    const end = fine[Math.min(cursor + 1, fine.length - 1)];
    const segLen = (fineCumulative[cursor + 1] ?? totalLength) - fineCumulative[cursor] || 1;
    const ratio = Math.max(0, Math.min(1, (distance - fineCumulative[cursor]) / segLen));
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    densePoints.push({
      x: start.x + dx * ratio,
      y: start.y + dy * ratio,
      distance,
      nx: (-dy / length) * normalDirection,
      ny: (dx / length) * normalDirection,
    });
  }

  return densePoints;
}

// Linear interpolation in the parameter domain used by centripetal Catmull-Rom.
function lerpT(a: number, b: number, ta: number, tb: number, t: number): number {
  if (tb === ta) return a;
  const r = (t - ta) / (tb - ta);
  return a + (b - a) * r;
}

function projectToDenseTrack(densePoints: DenseTrackPoint[], point: TrackPoint) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  for (let index = 0; index < densePoints.length; index += 1) {
    const candidate = densePoints[index];
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  const nearest = densePoints[nearestIndex] || densePoints[0];
  return {
    distance: nearest?.distance ?? 0,
    point: { x: nearest?.x ?? point.x, y: nearest?.y ?? point.y },
    index: nearestIndex,
  };
}

export function buildTrackGeometry(trackPath: [number, number][] | null, width: number, height: number): TrackGeometry | null {
  const points = trackPath?.map(([x, y]) => ({ x, y })) ?? [];
  if (points.length < 2) {
    return null;
  }

  const densePoints = interpolateTrack(points);
  const metrics = buildTrackMetrics(points, width, height);
  if (!metrics) {
    return null;
  }

  const totalLength = densePoints.at(-1)?.distance || 0;

  return {
    points,
    densePoints,
    totalLength,
    metrics,
    toScreen: (point) => toScreen(point, metrics),
    project: (point) => projectToDenseTrack(densePoints, point),
    pointAtDistance: (distance) => {
      if (!densePoints.length) {
        return { x: 0, y: 0, distance: 0, nx: 0, ny: -1 };
      }
      if (totalLength <= 0) {
        return densePoints[0];
      }
      const normalizedDistance = ((distance % totalLength) + totalLength) % totalLength;
      let nearest = densePoints[0];
      for (const point of densePoints) {
        if (point.distance >= normalizedDistance) {
          nearest = point;
          break;
        }
      }
      return nearest;
    },
  };
}
