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

  const segmentLengths: number[] = [];
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const length = Math.hypot(current.x - previous.x, current.y - previous.y);
    segmentLengths.push(length);
    cumulative.push(cumulative[index - 1] + length);
  }

  const totalLength = cumulative.at(-1) || 1;
  const densePoints: DenseTrackPoint[] = [];
  const count = Math.max(points.length, targetCount);

  for (let sample = 0; sample < count; sample += 1) {
    const distance = (sample / (count - 1)) * totalLength;
    let segmentIndex = 0;
    while (segmentIndex < segmentLengths.length - 1 && cumulative[segmentIndex + 1] < distance) {
      segmentIndex += 1;
    }

    const start = points[segmentIndex];
    const end = points[Math.min(segmentIndex + 1, points.length - 1)];
    const segmentLength = segmentLengths[segmentIndex] || 1;
    const ratio = Math.max(0, Math.min(1, (distance - cumulative[segmentIndex]) / segmentLength));
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;

    densePoints.push({
      x: start.x + dx * ratio,
      y: start.y + dy * ratio,
      distance,
      nx: -dy / length,
      ny: dx / length,
    });
  }

  return densePoints;
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
