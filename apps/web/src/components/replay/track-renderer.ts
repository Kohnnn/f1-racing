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

function drawTrackLine(ctx: CanvasRenderingContext2D, geometry: TrackGeometry, width: number) {
  const start = geometry.toScreen(geometry.points[0]);
  ctx.moveTo(start.x, start.y);
  for (let index = 1; index < geometry.points.length; index += 1) {
    const point = geometry.toScreen(geometry.points[index]);
    ctx.lineTo(point.x, point.y);
  }
  if (geometry.points.length > 2) {
    const end = geometry.toScreen(geometry.points[0]);
    ctx.lineTo(end.x, end.y);
  }
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

export function drawTrack(ctx: CanvasRenderingContext2D, geometry: TrackGeometry, trackStatus: string, showDrsZones: boolean) {
  const statusColor = TRACK_STATUS_COLORS[trackStatus] || TRACK_STATUS_COLORS.GREEN;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  drawTrackLine(ctx, geometry, 28);
  ctx.strokeStyle = "#05070c";
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  drawTrackLine(ctx, geometry, 22);
  ctx.strokeStyle = "#141922";
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = `${statusColor}88`;
  ctx.shadowBlur = trackStatus === "GREEN" ? 8 : 18;
  ctx.beginPath();
  drawTrackLine(ctx, geometry, 12);
  ctx.strokeStyle = statusColor;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  drawTrackLine(ctx, geometry, 5);
  ctx.strokeStyle = "#242b38";
  ctx.stroke();

  ctx.beginPath();
  drawTrackLine(ctx, geometry, 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
  ctx.stroke();

  if (showDrsZones && geometry.densePoints.length > 20) {
    const zoneStarts = [0.16, 0.46, 0.72];
    for (const startRatio of zoneStarts) {
      const startIndex = Math.floor(startRatio * geometry.densePoints.length);
      const endIndex = Math.min(geometry.densePoints.length - 1, startIndex + Math.floor(geometry.densePoints.length * 0.055));
      const first = geometry.toScreen(geometry.densePoints[startIndex]);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let index = startIndex + 1; index <= endIndex; index += 1) {
        const point = geometry.toScreen(geometry.densePoints[index]);
        ctx.lineTo(point.x, point.y);
      }
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  const start = geometry.toScreen(geometry.points[0]);
  const next = geometry.toScreen(geometry.points[1] ?? geometry.points[0]);
  const angle = Math.atan2(next.y - start.y, next.x - start.x) + Math.PI / 2;
  const markerLength = 14;
  ctx.beginPath();
  ctx.moveTo(start.x - Math.cos(angle) * markerLength, start.y - Math.sin(angle) * markerLength);
  ctx.lineTo(start.x + Math.cos(angle) * markerLength, start.y + Math.sin(angle) * markerLength);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.font = "800 9px Aptos, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("S/F", start.x + 10, start.y - 8);
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
  for (const driver of drivers) {
    const screen = geometry.toScreen(driver);
    const projection = geometry.project(driver);
    const normal = geometry.densePoints[projection.index] ?? { nx: 0, ny: -1 };
    const isSelected = selectedDrivers.includes(driver.abbr);
    const isDrsActive = Number(driver.drs ?? 0) >= 10;
    const radius = isSelected ? 7 : 4.6;

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = `${driver.color}40`;
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

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = driver.color;
    ctx.fill();
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = isSelected ? 2.2 : 1.4;
    ctx.stroke();

    if (showDriverLabels || isSelected || (driver.position ?? 99) <= 3) {
      const labelX = screen.x + normal.nx * (isSelected ? 44 : 28);
      const labelY = screen.y - normal.ny * (isSelected ? 44 : 28);
      ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      const textWidth = ctx.measureText(driver.abbr).width + 14;
      ctx.beginPath();
      ctx.roundRect(labelX - textWidth / 2, labelY - 10, textWidth, 18, 9);
      ctx.fill();
      ctx.stroke();
      ctx.font = isSelected ? "900 10px Aptos, sans-serif" : "800 8px Aptos, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(driver.abbr, labelX, labelY);
    }
  }
}
