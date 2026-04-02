import type { FlowCarEntry } from "./types";

export interface FlowBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface FlowMetrics {
  wakeWidth: number;
  wakeLength: number;
  wakeArea: number;
  dragProxy: number;
}

export interface FlowMaskData {
  width: number;
  height: number;
  obstacle: Uint8Array;
  bounds: FlowBounds;
  centroid: { x: number; y: number };
  obstacleArea: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function indexAt(x: number, y: number, width: number) {
  return y * width + x;
}

export function analyzeMaskImageData(imageData: ImageData): FlowMaskData {
  const { width, height, data } = imageData;
  const obstacle = new Uint8Array(width * height);
  let minX = width - 1;
  let maxX = 0;
  let minY = height - 1;
  let maxY = 0;
  let sumX = 0;
  let sumY = 0;
  let obstacleArea = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = indexAt(x, y, width) * 4;
      const alpha = data[pixelIndex + 3];
      const luminance = (data[pixelIndex] + data[pixelIndex + 1] + data[pixelIndex + 2]) / 3;
      const solid = alpha > 20 && (luminance < 205 || (data[pixelIndex] > 240 && data[pixelIndex + 1] > 240 && data[pixelIndex + 2] > 240));
      if (!solid) {
        continue;
      }

      const index = indexAt(x, y, width);
      obstacle[index] = 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
      obstacleArea += 1;
    }
  }

  if (!obstacleArea) {
    throw new Error("No obstacle pixels were found in the provided mask.");
  }

  return {
    width,
    height,
    obstacle,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
    centroid: {
      x: sumX / obstacleArea,
      y: sumY / obstacleArea,
    },
    obstacleArea,
  };
}

export function computeRelativeMetrics(
  maskData: FlowMaskData,
  velocityX: Float32Array,
  inflowVelocity: number,
): FlowMetrics {
  const { width, height, bounds, centroid, obstacleArea } = maskData;
  const sampleX = Math.min(width - 2, Math.round(bounds.maxX + bounds.width * 0.38));
  const threshold = 0.12;

  const deficitAt = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return 0;
    }
    const deficit = (inflowVelocity - velocityX[indexAt(x, y, width)]) / Math.max(inflowVelocity, 0.0001);
    return clamp(deficit, 0, 1);
  };

  let top = Math.round(centroid.y);
  let bottom = Math.round(centroid.y);

  while (top > 1 && deficitAt(sampleX, top) > threshold) {
    top -= 1;
  }

  while (bottom < height - 2 && deficitAt(sampleX, bottom) > threshold) {
    bottom += 1;
  }

  const centerY = clamp(Math.round(centroid.y), 0, height - 1);
  let farthestX = bounds.maxX;

  for (let x = bounds.maxX; x < width; x += 1) {
    if (deficitAt(x, centerY) > 0.07) {
      farthestX = x;
    }
  }

  let wakeAreaCount = 0;
  let dragProxySum = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = bounds.maxX; x < width; x += 1) {
      const deficit = deficitAt(x, y);
      if (deficit > threshold) {
        wakeAreaCount += 1;
      }
      dragProxySum += deficit;
    }
  }

  return {
    wakeWidth: Math.max(0, (bottom - top) / Math.max(1, bounds.height)),
    wakeLength: Math.max(0, (farthestX - bounds.maxX) / Math.max(1, bounds.width)),
    wakeArea: wakeAreaCount / Math.max(1, obstacleArea),
    dragProxy: (dragProxySum / Math.max(1, obstacleArea)) * 100,
  };
}

export function formatMetricValue(metricId: keyof FlowMetrics, value: number, car: FlowCarEntry) {
  if (metricId === "dragProxy") {
    return `${value.toFixed(1)} pts`;
  }

  if (metricId === "wakeArea") {
    return `${value.toFixed(2)}x footprint`;
  }

  if (metricId === "wakeWidth") {
    return `${value.toFixed(2)}x car width`;
  }

  return `${value.toFixed(2)}x car length`;
}