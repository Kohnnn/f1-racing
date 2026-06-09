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

export interface CornerMarker {
  number: number;
  letter?: string;
  /** Cumulative distance along the track centerline (meters or normalized). */
  trackPosition: number | null;
  angleDeg?: number;
}

export interface DrsZoneMarker {
  id?: string;
  /** Cumulative distance along the track centerline at zone start. */
  from: number;
  /** Cumulative distance along the track centerline at zone end. */
  to: number;
  /** Optional pre-computed normalised ratios (0..1). Used as a fallback. */
  fromRatio?: number;
  toRatio?: number;
}

export interface MarshalSectorMarker {
  index: number;
  fromDistance: number;
  toDistance: number;
  flag?: string | null;
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

export function drawTrack(ctx: CanvasRenderingContext2D, geometry: TrackGeometry, trackStatus: string, showDrsZones: boolean, drsZones?: DrsZoneMarker[], totalCircuitLength?: number) {
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
  if (showDrsZones) {
    drawDrsZones(ctx, geometry, drsZones, totalCircuitLength);
  }

  drawStartFinishLine(ctx, geometry);
}

export type HeatmapChannel = "speed" | "throttle" | "brake";

/**
 * Colour the racing line by a per-distance telemetry sample for one driver.
 * `samples` is an array of { ratio (0..1 along the lap), value (0..1 normalised) }
 * already aggregated by the caller from the GPS-projected frames. Segments are
 * drawn with a channel-specific colour ramp so users can read where a driver is
 * flat-out, braking, or hard on throttle around the lap.
 */
export function drawTelemetryHeatmap(
  ctx: CanvasRenderingContext2D,
  geometry: TrackGeometry,
  samples: Array<{ ratio: number; value: number }>,
  channel: HeatmapChannel,
) {
  if (!samples.length || geometry.densePoints.length < 8) return;
  const total = geometry.densePoints.length;

  // Build a lookup from track index -> value by binning samples to the nearest
  // dense-point index, then forward-filling gaps so the line stays continuous.
  const valueByIndex = new Array<number | null>(total).fill(null);
  for (const s of samples) {
    const idx = Math.max(0, Math.min(total - 1, Math.round(s.ratio * (total - 1))));
    const prev = valueByIndex[idx];
    valueByIndex[idx] = prev === null ? s.value : (prev + s.value) * 0.5;
  }
  let lastVal = 0;
  for (let i = 0; i < total; i += 1) {
    if (valueByIndex[i] === null) valueByIndex[i] = lastVal;
    else lastVal = valueByIndex[i] as number;
  }

  ctx.save();
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < total - 1; i += 1) {
    const a = geometry.toScreen(geometry.densePoints[i]);
    const b = geometry.toScreen(geometry.densePoints[i + 1]);
    ctx.strokeStyle = heatColor(channel, valueByIndex[i] as number);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function heatColor(channel: HeatmapChannel, value: number): string {
  const v = Math.max(0, Math.min(1, value));
  if (channel === "brake") {
    // grey -> red as brake increases
    const r = Math.round(90 + v * 165);
    const g = Math.round(96 - v * 70);
    const b = Math.round(108 - v * 80);
    return `rgba(${r}, ${g}, ${b}, 0.92)`;
  }
  if (channel === "throttle") {
    // grey -> green as throttle increases
    const r = Math.round(96 - v * 60);
    const g = Math.round(96 + v * 150);
    const b = Math.round(108 - v * 50);
    return `rgba(${r}, ${g}, ${b}, 0.92)`;
  }
  // speed: blue (slow) -> cyan -> yellow -> red (fast)
  const stops = [
    [56, 120, 255],
    [56, 220, 220],
    [240, 220, 70],
    [255, 90, 60],
  ];
  const seg = v * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const r = Math.round(stops[i][0] + (stops[i + 1][0] - stops[i][0]) * f);
  const g = Math.round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * f);
  const b = Math.round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * f);
  return `rgba(${r}, ${g}, ${b}, 0.92)`;
}

/**
 * Draws DRS activation zones on top of the asphalt. When `drsZones` is provided
 * with cumulative-distance ranges (or normalised ratios) we draw exact arc
 * segments. Otherwise we fall back to three evenly distributed segments so
 * older replay packs still get a visible cue.
 */
export function drawDrsZones(
  ctx: CanvasRenderingContext2D,
  geometry: TrackGeometry,
  drsZones?: DrsZoneMarker[],
  totalCircuitLength?: number,
) {
  if (geometry.densePoints.length < 20) return;

  ctx.save();
  ctx.shadowColor = "rgba(34, 197, 94, 0.55)";
  ctx.shadowBlur = 14;
  ctx.strokeStyle = "rgba(34, 197, 94, 0.85)";
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";

  if (drsZones && drsZones.length) {
    for (const zone of drsZones) {
      // Resolve start/end ratios. Prefer absolute distances when present + we
      // have a known total circuit length; otherwise use the explicit ratios.
      let startRatio: number;
      let endRatio: number;
      if (Number.isFinite(zone.from) && Number.isFinite(zone.to) && totalCircuitLength && totalCircuitLength > 0) {
        startRatio = ((zone.from / totalCircuitLength) % 1 + 1) % 1;
        endRatio = ((zone.to / totalCircuitLength) % 1 + 1) % 1;
      } else if (typeof zone.fromRatio === "number" && typeof zone.toRatio === "number") {
        startRatio = ((zone.fromRatio % 1) + 1) % 1;
        endRatio = ((zone.toRatio % 1) + 1) % 1;
      } else {
        continue;
      }
      drawDrsArcByRatio(ctx, geometry, startRatio, endRatio);
    }
  } else {
    // Fallback when no zones are exposed by the data pack.
    const zoneStarts = [0.16, 0.46, 0.72];
    for (const startRatio of zoneStarts) {
      drawDrsArcByRatio(ctx, geometry, startRatio, Math.min(1, startRatio + 0.06));
    }
  }
  ctx.restore();
}

function drawDrsArcByRatio(
  ctx: CanvasRenderingContext2D,
  geometry: TrackGeometry,
  startRatio: number,
  endRatio: number,
) {
  const total = geometry.densePoints.length;
  const startIndex = Math.max(0, Math.min(total - 1, Math.floor(startRatio * total)));
  const wrapped = endRatio < startRatio;
  const segments = wrapped
    ? [
        [startIndex, total - 1],
        [0, Math.max(0, Math.min(total - 1, Math.floor(endRatio * total)))],
      ]
    : [[startIndex, Math.max(0, Math.min(total - 1, Math.floor(endRatio * total)))]];

  for (const [from, to] of segments) {
    if (to <= from) continue;
    const first = geometry.toScreen(geometry.densePoints[from]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let index = from + 1; index <= to; index += 1) {
      const screen = geometry.toScreen(geometry.densePoints[index]);
      ctx.lineTo(screen.x, screen.y);
    }
    ctx.stroke();
  }
}

/**
 * Tints a polyline arc when an explicit marshal-sector flag is active. The
 * caller passes the active flag (e.g. "YELLOW", "DOUBLE YELLOW", "RED") and
 * the sector range expressed as cumulative-distance pairs that live in the
 * canonical track-shape JSON.
 */
export function drawMarshalSectors(
  ctx: CanvasRenderingContext2D,
  geometry: TrackGeometry,
  sectors: MarshalSectorMarker[] | undefined,
  totalCircuitLength: number,
  activeFlagBySector: Map<number, string>,
) {
  if (!sectors?.length || totalCircuitLength <= 0 || activeFlagBySector.size === 0) {
    return;
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  for (const sector of sectors) {
    const flag = activeFlagBySector.get(sector.index);
    if (!flag) continue;
    const color = TRACK_STATUS_COLORS[flag] || TRACK_STATUS_COLORS.YELLOW;
    ctx.strokeStyle = color;
    ctx.shadowColor = `${color}c0`;
    ctx.shadowBlur = 14;
    const startRatio = ((sector.fromDistance / totalCircuitLength) % 1 + 1) % 1;
    const endRatio = ((sector.toDistance / totalCircuitLength) % 1 + 1) % 1;
    drawDrsArcByRatio(ctx, geometry, startRatio, endRatio);
  }
  ctx.restore();
}

/**
 * Draws short-lived pulses at pit-out positions. Each pulse fades over ~3s.
 * Caller passes a list of active pulses with their normalised ratio and age.
 */
export function drawPitPulses(
  ctx: CanvasRenderingContext2D,
  geometry: TrackGeometry,
  pulses: Array<{ ratio: number; ageMs: number; color?: string; label?: string }>,
) {
  if (!pulses.length) return;
  for (const pulse of pulses) {
    const ratio = ((pulse.ratio % 1) + 1) % 1;
    const distance = ratio * geometry.totalLength;
    const point = geometry.pointAtDistance(distance);
    const screen = geometry.toScreen(point);
    const lifetime = 3200; // ms
    const t = Math.min(1, pulse.ageMs / lifetime);
    const radius = 8 + t * 28;
    const alpha = (1 - t) * 0.85;
    if (alpha <= 0.02) continue;
    ctx.save();
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = pulse.color ?? `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
    ctx.shadowColor = `rgba(56, 189, 248, ${(alpha * 0.6).toFixed(3)})`;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    if (pulse.label && t < 0.6) {
      ctx.font = "800 9px Aptos, sans-serif";
      ctx.fillStyle = `rgba(186, 230, 253, ${alpha.toFixed(3)})`;
      ctx.textAlign = "center";
      ctx.fillText(pulse.label, screen.x, screen.y - radius - 4);
    }
    ctx.restore();
  }
}

/**
 * Draws corner number labels around the circuit. Each corner is positioned by
 * its `trackPosition` (cumulative distance along the centerline). When that
 * value is missing we fall back to evenly distributing labels around the
 * polyline so the user still gets a sense of corner ordering.
 */
export function drawCorners(
  ctx: CanvasRenderingContext2D,
  geometry: TrackGeometry,
  corners: CornerMarker[],
  totalCircuitLength: number,
) {
  if (!corners.length) return;

  ctx.save();
  ctx.font = "800 9px Aptos, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const fallbackTotal = corners.length;
  for (let i = 0; i < corners.length; i += 1) {
    const corner = corners[i];
    const ratio =
      corner.trackPosition !== null && totalCircuitLength > 0
        ? Math.max(0, Math.min(1, corner.trackPosition / totalCircuitLength))
        : i / fallbackTotal;
    const distance = ratio * geometry.totalLength;
    const point = geometry.pointAtDistance(distance);
    const screen = geometry.toScreen(point);
    // Push label outward along the track normal so it sits off the racing line.
    const offset = 24;
    const labelX = screen.x + (point.nx ?? 0) * offset;
    const labelY = screen.y - (point.ny ?? -1) * offset;

    const label = `${corner.number}${corner.letter ?? ""}`;
    const metrics = ctx.measureText(label);
    const padX = 6;
    const padY = 4;
    const w = metrics.width + padX * 2;
    const h = 16;
    ctx.fillStyle = "rgba(15, 21, 32, 0.86)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(labelX - w / 2, labelY - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(247, 250, 255, 0.92)";
    ctx.fillText(label, labelX, labelY);
    void padY;
  }
  ctx.restore();
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
