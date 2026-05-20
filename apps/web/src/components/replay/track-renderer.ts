import type { TrackGeometry } from "./track-geometry";

export interface DriverMarker {
  abbr: string;
  x: number;
  y: number;
  color: string;
  position: number | null;
  speed?: number | null;
  drs?: number | null;
}

export interface SafetyCarMarker {
  x: number;
  y: number;
  phase: string;
}

const TRACK_STATUS_COLORS: Record<string, string> = {
  GREEN: "#7b8496",
  YELLOW: "#f5c518",
  "DOUBLE YELLOW": "#ffcd38",
  SC: "#ff9d00",
  VSC: "#eab308",
  RED: "#e10600",
  CHEQUERED: "#f5f7fb",
};

function strokeDensePath(ctx: CanvasRenderingContext2D, geometry: TrackGeometry, lineWidth: number, strokeStyle: string, options: { closed?: boolean; dashed?: boolean; shadowColor?: string; shadowBlur?: number } = {}) {
  const { closed = true, dashed = false, shadowColor, shadowBlur = 0 } = options;
  const points = geometry.densePoints;
  if (points.length < 2) return;

  ctx.save();
  if (shadowColor) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
  }
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (dashed) {
    ctx.setLineDash([6, 8]);
  }

  ctx.beginPath();
  const first = geometry.toScreen(points[0]);
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const screen = geometry.toScreen(points[index]);
    ctx.lineTo(screen.x, screen.y);
  }
  if (closed) {
    ctx.lineTo(first.x, first.y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawTrack(ctx: CanvasRenderingContext2D, geometry: TrackGeometry, trackStatus: string, showDrsZones: boolean) {
  const statusColor = TRACK_STATUS_COLORS[trackStatus] || TRACK_STATUS_COLORS.GREEN;

  // Drop shadow under the asphalt slab.
  strokeDensePath(ctx, geometry, 32, "#020409", { shadowColor: "rgba(0,0,0,0.7)", shadowBlur: 22 });

  // Asphalt slab.
  strokeDensePath(ctx, geometry, 24, "#0d121b");

  // Track surface gradient simulated with two semi-transparent passes for subtle depth.
  strokeDensePath(ctx, geometry, 18, "#1a212e");
  strokeDensePath(ctx, geometry, 14, "#252d3d");

  // Status accent: a soft glow that sits on top of the asphalt; strongest in non-green sectors.
  const accentBlur = trackStatus === "GREEN" ? 4 : 22;
  strokeDensePath(ctx, geometry, 4, statusColor, {
    shadowColor: `${statusColor}c0`,
    shadowBlur: accentBlur,
  });

  // Centerline pin-stripe for legibility.
  strokeDensePath(ctx, geometry, 1.4, "rgba(247, 250, 255, 0.32)", { dashed: true });

  // DRS zones — drawn over the surface but under markers, with a green glow.
  if (showDrsZones && geometry.densePoints.length > 20) {
    const zoneStarts = [0.16, 0.46, 0.72];
    for (const startRatio of zoneStarts) {
      const startIndex = Math.floor(startRatio * geometry.densePoints.length);
      const endIndex = Math.min(geometry.densePoints.length - 1, startIndex + Math.floor(geometry.densePoints.length * 0.06));
      const first = geometry.toScreen(geometry.densePoints[startIndex]);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let index = startIndex + 1; index <= endIndex; index += 1) {
        const screen = geometry.toScreen(geometry.densePoints[index]);
        ctx.lineTo(screen.x, screen.y);
      }
      ctx.shadowColor = "rgba(34, 197, 94, 0.55)";
      ctx.shadowBlur = 14;
      ctx.strokeStyle = "rgba(34, 197, 94, 0.85)";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }
  }

  drawStartFinishLine(ctx, geometry);
}

function drawStartFinishLine(ctx: CanvasRenderingContext2D, geometry: TrackGeometry) {
  const start = geometry.densePoints[0];
  if (!start) return;
  const screen = geometry.toScreen(start);
  const tangent = { x: -start.ny, y: start.nx };
  const length = 18;

  ctx.save();
  ctx.lineCap = "butt";

  // Black slab.
  ctx.beginPath();
  ctx.moveTo(screen.x - tangent.x * length, screen.y + tangent.y * length);
  ctx.lineTo(screen.x + tangent.x * length, screen.y - tangent.y * length);
  ctx.strokeStyle = "rgba(15, 18, 26, 0.95)";
  ctx.lineWidth = 12;
  ctx.stroke();

  // Checker pattern (alternating squares along the line).
  const segments = 6;
  for (let index = 0; index < segments; index += 1) {
    const t0 = -1 + (2 * index) / segments;
    const t1 = -1 + (2 * (index + 1)) / segments;
    ctx.beginPath();
    ctx.moveTo(screen.x + tangent.x * length * t0, screen.y - tangent.y * length * t0);
    ctx.lineTo(screen.x + tangent.x * length * t1, screen.y - tangent.y * length * t1);
    ctx.strokeStyle = index % 2 === 0 ? "#f8fafc" : "#020409";
    ctx.lineWidth = 8;
    ctx.stroke();
  }

  // Label.
  ctx.fillStyle = "rgba(247, 250, 255, 0.85)";
  ctx.font = "800 9px Aptos, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("S/F", screen.x + 14, screen.y - 12);
  ctx.restore();
}

export function drawSafetyCar(ctx: CanvasRenderingContext2D, geometry: TrackGeometry, safetyCar: SafetyCarMarker | null) {
  if (!safetyCar) {
    return;
  }

  const screen = geometry.toScreen({ x: safetyCar.x, y: safetyCar.y });
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 130);
  ctx.save();
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, 17 + pulse * 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 157, 0, ${0.22 + pulse * 0.12})`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#ff9d00";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fff7ed";
  ctx.stroke();
  ctx.fillStyle = "#fff7ed";
  ctx.font = "900 11px Aptos, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(safetyCar.phase === "returning" ? "SC IN" : "SC", screen.x + 13, screen.y);
  ctx.restore();
}

export function drawDrivers(
  ctx: CanvasRenderingContext2D,
  drivers: DriverMarker[],
  geometry: TrackGeometry,
  selectedDrivers: string[],
  showDriverLabels: boolean,
) {
  // First pass: shadows so markers appear to sit above the surface.
  ctx.save();
  for (const driver of drivers) {
    const screen = geometry.toScreen(driver);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y + 1.5, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fill();
  }
  ctx.restore();

  for (const driver of drivers) {
    const screen = geometry.toScreen(driver);
    const projection = geometry.project(driver);
    const normal = geometry.densePoints[projection.index] ?? { nx: 0, ny: -1 };
    const isSelected = selectedDrivers.includes(driver.abbr);
    const isDrsActive = Number(driver.drs ?? 0) >= 10;
    const isLeader = driver.position === 1;
    const radius = isSelected ? 7.6 : 5.4;

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = `${driver.color}33`;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screen.x + normal.nx * 30, screen.y - normal.ny * 30);
      ctx.strokeStyle = `${driver.color}aa`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (isDrsActive) {
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Outer ring for the leader so it pops out.
    if (isLeader) {
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius + 2.6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 215, 130, 0.85)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = driver.color;
    ctx.fill();
    ctx.strokeStyle = isLeader ? "#fde68a" : "#f8fafc";
    ctx.lineWidth = isSelected ? 2.2 : 1.6;
    ctx.stroke();

    if (showDriverLabels || isSelected || (driver.position ?? 99) <= 3) {
      const labelOffset = isSelected ? 46 : 30;
      const labelX = screen.x + normal.nx * labelOffset;
      const labelY = screen.y - normal.ny * labelOffset;
      const text = driver.abbr;
      ctx.font = isSelected ? "900 11px Aptos, sans-serif" : "800 9px Aptos, sans-serif";
      const textWidth = ctx.measureText(text).width + 16;
      const height = isSelected ? 20 : 17;
      ctx.fillStyle = "rgba(5, 8, 16, 0.86)";
      ctx.strokeStyle = `${driver.color}88`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(labelX - textWidth / 2, labelY - height / 2, textWidth, height, height / 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, labelX, labelY);
    }
  }
}
