#!/usr/bin/env node
/**
 * extract-mask.mjs
 *
 * Render-free top-mask extractor for GLB assets.
 * It uses Three.js GLTF parsing so node transforms are respected,
 * then projects the mesh into 2D and rasterizes a clean silhouette.
 *
 * Usage:
 *   node extract-mask.mjs <glbPath> <outputPath> [width] [height] [projection]
 *
 * Example:
 *   node extract-mask.mjs apps/web/public/models/2025/mclaren/mcl39.glb apps/web/public/assets/cars/mcl39-style/top-mask.png 1024 576 xz
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createRequire } from "module";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const PROJECTION_AXES = {
  xy: ["x", "y"],
  xz: ["x", "z"],
  yz: ["y", "z"],
};
const SUPERSAMPLE = 2;
const FLOW_PADDING = {
  left: 0.24,
  right: 0.42,
  vertical: 0.32,
};

if (!globalThis.self) {
  globalThis.self = globalThis;
}

if (!globalThis.createImageBitmap) {
  globalThis.createImageBitmap = async () => ({ close() {} });
}

const [_node, _script, glbPath, outputPath, widthStr = "1024", heightStr = "576", projection = "xz"] = process.argv;

if (!glbPath || !outputPath) {
  console.error("Usage: node extract-mask.mjs <glbPath> <outputPath> [width] [height] [projection]");
  process.exit(1);
}

if (!PROJECTION_AXES[projection]) {
  console.error(`Invalid projection \"${projection}\". Use one of: ${Object.keys(PROJECTION_AXES).join(", ")}`);
  process.exit(1);
}

const OUT_W = parseInt(widthStr, 10);
const OUT_H = parseInt(heightStr, 10);
const RASTER_W = OUT_W * SUPERSAMPLE;
const RASTER_H = OUT_H * SUPERSAMPLE;
const ROOT = process.cwd();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function projectVertex(vector, projectionName) {
  const [firstAxis, secondAxis] = PROJECTION_AXES[projectionName];
  return [vector[firstAxis], vector[secondAxis]];
}

function computePrincipalAngle(points) {
  let sumX = 0;
  let sumY = 0;

  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
  }

  const meanX = sumX / points.length;
  const meanY = sumY / points.length;
  let covXX = 0;
  let covYY = 0;
  let covXY = 0;

  for (const [x, y] of points) {
    const dx = x - meanX;
    const dy = y - meanY;
    covXX += dx * dx;
    covYY += dy * dy;
    covXY += dx * dy;
  }

  return {
    meanX,
    meanY,
    angle: 0.5 * Math.atan2(2 * covXY, covXX - covYY),
  };
}

function rotatePoint(x, y, meanX, meanY, angle) {
  const dx = x - meanX;
  const dy = y - meanY;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

function computeBounds(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function shouldFlipHorizontal(points) {
  const bounds = computeBounds(points);
  const span = Math.max(bounds.width, 0.0001);
  const bucketCount = 12;
  const buckets = Array.from({ length: bucketCount }, () => ({ minY: Infinity, maxY: -Infinity }));

  for (const [x, y] of points) {
    const bucketIndex = clamp(Math.floor(((x - bounds.minX) / span) * bucketCount), 0, bucketCount - 1);
    const bucket = buckets[bucketIndex];
    if (y < bucket.minY) bucket.minY = y;
    if (y > bucket.maxY) bucket.maxY = y;
  }

  const widths = buckets.map((bucket) => {
    if (!Number.isFinite(bucket.minY) || !Number.isFinite(bucket.maxY)) {
      return 0;
    }
    return bucket.maxY - bucket.minY;
  });

  const leftWidth = average(widths.slice(0, 3));
  const rightWidth = average(widths.slice(-3));
  return leftWidth > rightWidth;
}

async function loadTriangles(fullGlbPath, projectionName) {
  const loader = new GLTFLoader();
  const glbData = readFileSync(fullGlbPath);
  const arrayBuffer = glbData.buffer.slice(glbData.byteOffset, glbData.byteOffset + glbData.byteLength);
  const gltf = await new Promise((resolve, reject) => loader.parse(arrayBuffer, "", resolve, reject));
  const projectedTriangles = [];
  const projectedPoints = [];
  const scaleSamples = [];

  gltf.scene.updateMatrixWorld(true);

  const worldPoint = new THREE.Vector3();
  gltf.scene.traverse((node) => {
    if (!node.isMesh || !node.geometry?.attributes?.position) {
      return;
    }

    const positions = node.geometry.attributes.position;
    const index = node.geometry.index;
    const meshPoints = [];

    for (let i = 0; i < positions.count; i += 1) {
      worldPoint.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
      const point = projectVertex(worldPoint, projectionName);
      meshPoints.push(point);
      projectedPoints.push(point);
    }

    const meshBounds = computeBounds(meshPoints);
    scaleSamples.push(Math.max(meshBounds.width, meshBounds.height));

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        if (i + 2 >= index.count) break;
        const ai = index.getX(i);
        const bi = index.getX(i + 1);
        const ci = index.getX(i + 2);
        const a = meshPoints[ai];
        const b = meshPoints[bi];
        const c = meshPoints[ci];
        if (a && b && c) {
          projectedTriangles.push([a, b, c]);
        }
      }
      return;
    }

    for (let i = 0; i < meshPoints.length; i += 3) {
      const a = meshPoints[i];
      const b = meshPoints[i + 1];
      const c = meshPoints[i + 2];
      if (a && b && c) {
        projectedTriangles.push([a, b, c]);
      }
    }
  });

  const medianScale = median(scaleSamples);
  const outlierThreshold = medianScale * 5.5;
  const filteredTriangles = projectedTriangles.filter((triangle) => {
    const bounds = computeBounds(triangle);
    return Math.max(bounds.width, bounds.height) <= outlierThreshold;
  });

  return {
    meshCount: gltf.parser.json.meshes?.length ?? 0,
    projectedPoints,
    projectedTriangles: filteredTriangles.length ? filteredTriangles : projectedTriangles,
    outlierThreshold,
  };
}

function rasterizeTriangles(triangles, outputPath) {
  const points = triangles.flat();
  const bounds = computeBounds(points);
  const leftPad = bounds.width * FLOW_PADDING.left;
  const rightPad = bounds.width * FLOW_PADDING.right;
  const verticalPad = bounds.height * FLOW_PADDING.vertical;
  const worldMinX = bounds.minX - leftPad;
  const worldMaxX = bounds.maxX + rightPad;
  const worldMinY = bounds.minY - verticalPad;
  const worldMaxY = bounds.maxY + verticalPad;
  const scaleX = RASTER_W / Math.max(worldMaxX - worldMinX, 0.0001);
  const scaleY = RASTER_H / Math.max(worldMaxY - worldMinY, 0.0001);
  const pixels = Buffer.alloc(RASTER_W * RASTER_H * 4);

  function toPixel(x, y) {
    return [
      Math.round((x - worldMinX) * scaleX),
      Math.round((y - worldMinY) * scaleY),
    ];
  }

  function setPixel(x, y) {
    if (x < 0 || x >= RASTER_W || y < 0 || y >= RASTER_H) return;
    const index = (y * RASTER_W + x) * 4;
    pixels[index] = 255;
    pixels[index + 1] = 255;
    pixels[index + 2] = 255;
    pixels[index + 3] = 255;
  }

  function rasterTriangle(x1, y1, x2, y2, x3, y3) {
    let ax = x1, ay = y1;
    let bx = x2, by = y2;
    let cx = x3, cy = y3;

    if (ay > by) {
      [ax, bx] = [bx, ax];
      [ay, by] = [by, ay];
    }
    if (ay > cy) {
      [ax, cx] = [cx, ax];
      [ay, cy] = [cy, ay];
    }
    if (by > cy) {
      [bx, cx] = [cx, bx];
      [by, cy] = [cy, by];
    }
    if (Math.abs(cy - ay) < 0.01) {
      return;
    }

    for (let py = Math.max(0, Math.floor(ay)); py <= Math.min(RASTER_H - 1, Math.ceil(cy)); py += 1) {
      const t1 = Math.abs(by - ay) > 0.01 ? (py - ay) / (by - ay) : 0;
      const t2 = Math.abs(cy - ay) > 0.01 ? (py - ay) / (cy - ay) : 0;
      let xLeft = ax + t1 * (bx - ax);
      let xRight = ax + t2 * (cx - ax);
      if (xLeft > xRight) {
        [xLeft, xRight] = [xRight, xLeft];
      }
      for (let px = Math.max(0, Math.floor(xLeft)); px <= Math.min(RASTER_W - 1, Math.ceil(xRight)); px += 1) {
        setPixel(px, py);
      }
    }
  }

  for (const [[x1, y1], [x2, y2], [x3, y3]] of triangles) {
    const [px1, py1] = toPixel(x1, y1);
    const [px2, py2] = toPixel(x2, y2);
    const [px3, py3] = toPixel(x3, y3);
    rasterTriangle(px1, py1, px2, py2, px3, py3);
  }

  return sharp(pixels, { raw: { width: RASTER_W, height: RASTER_H, channels: 4 } })
    .resize(OUT_W, OUT_H, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toFile(outputPath)
    .then(() => {
      let solidPixels = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 0) solidPixels += 1;
      }

      return {
        bounds,
        solidPixels,
        coverage: (solidPixels / (RASTER_W * RASTER_H)) * 100,
      };
    });
}

async function main() {
  const fullGlbPath = resolve(ROOT, glbPath);
  const fullOutputPath = resolve(ROOT, outputPath);
  const { meshCount, projectedPoints, projectedTriangles, outlierThreshold } = await loadTriangles(fullGlbPath, projection);

  if (!projectedPoints.length || !projectedTriangles.length) {
    throw new Error("No projected geometry was extracted from the GLB.");
  }

  const { meanX, meanY, angle } = computePrincipalAngle(projectedPoints);
  let rotatedTriangles = projectedTriangles.map(([a, b, c]) => ([
    rotatePoint(a[0], a[1], meanX, meanY, angle),
    rotatePoint(b[0], b[1], meanX, meanY, angle),
    rotatePoint(c[0], c[1], meanX, meanY, angle),
  ]));

  const rotatedPoints = rotatedTriangles.flat();
  if (shouldFlipHorizontal(rotatedPoints)) {
    rotatedTriangles = rotatedTriangles.map((triangle) => triangle.map(([x, y]) => ([-x, y])));
  }

  const result = await rasterizeTriangles(rotatedTriangles, fullOutputPath);

  console.log(`GLB meshes: ${meshCount}`);
  console.log(`Projection: ${projection.toUpperCase()} · rotation ${(angle * 180 / Math.PI).toFixed(2)}deg`);
  console.log(`Triangles: ${projectedTriangles.length} · outlier threshold ${outlierThreshold.toFixed(3)}`);
  console.log(`Mask bounds: ${result.bounds.width.toFixed(3)} x ${result.bounds.height.toFixed(3)}`);
  console.log(`Saved: ${fullOutputPath} (${result.coverage.toFixed(1)}% coverage, ${result.solidPixels} supersampled px)`);
}

main().catch((error) => {
  console.error("Error:", error?.message || error);
  process.exit(1);
});
