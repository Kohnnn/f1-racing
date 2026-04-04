export interface TrackPoint {
  x: number;
  y: number;
}

export interface DriverMarker {
  abbr: string;
  x: number;
  y: number;
  color: string;
  position: number | null;
}

const TRACK_STATUS_COLORS: Record<string, string> = {
  GREEN: "#3a3f4d",
  YELLOW: "#f5c518",
  "DOUBLE YELLOW": "#ffcd38",
  SC: "#ff9d00",
  VSC: "#eab308",
  RED: "#e10600",
  CHEQUERED: "#f5f7fb",
};

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  points: TrackPoint[],
  width: number,
  height: number,
  trackStatus: string,
) {
  if (!points.length) {
    return;
  }

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

  const padX = 40;
  const padTop = 54;
  const padBottom = 70;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((width - padX * 2) / rangeX, (height - padTop - padBottom) / rangeY);
  const offsetX = padX + (width - padX * 2 - rangeX * scale) / 2;
  const offsetY = padTop + (height - padTop - padBottom - rangeY * scale) / 2;

  function toScreen(point: TrackPoint): [number, number] {
    return [
      offsetX + (point.x - minX) * scale,
      offsetY + (maxY - point.y) * scale,
    ];
  }

  ctx.beginPath();
  ctx.strokeStyle = "#11151d";
  ctx.lineWidth = 22;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const [startX, startY] = toScreen(points[0]);
  ctx.moveTo(startX, startY);
  for (let index = 1; index < points.length; index += 1) {
    const [x, y] = toScreen(points[index]);
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = TRACK_STATUS_COLORS[trackStatus] || TRACK_STATUS_COLORS.GREEN;
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.moveTo(startX, startY);
  for (let index = 1; index < points.length; index += 1) {
    const [x, y] = toScreen(points[index]);
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = "#5b6274";
  ctx.lineWidth = 2;
  ctx.moveTo(startX, startY);
  for (let index = 1; index < points.length; index += 1) {
    const [x, y] = toScreen(points[index]);
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  const [nextX, nextY] = toScreen(points[1] ?? points[0]);
  const angle = Math.atan2(nextY - startY, nextX - startX) + Math.PI / 2;
  const markerLength = 10;
  ctx.beginPath();
  ctx.moveTo(startX - Math.cos(angle) * markerLength, startY - Math.sin(angle) * markerLength);
  ctx.lineTo(startX + Math.cos(angle) * markerLength, startY + Math.sin(angle) * markerLength);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
}

export function drawDrivers(
  ctx: CanvasRenderingContext2D,
  drivers: DriverMarker[],
  trackPoints: TrackPoint[],
  width: number,
  height: number,
  selectedDrivers: string[],
) {
  if (!trackPoints.length) {
    return;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of trackPoints) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const padX = 40;
  const padTop = 54;
  const padBottom = 70;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((width - padX * 2) / rangeX, (height - padTop - padBottom) / rangeY);
  const offsetX = padX + (width - padX * 2 - rangeX * scale) / 2;
  const offsetY = padTop + (height - padTop - padBottom - rangeY * scale) / 2;

  for (const driver of drivers) {
    const sx = offsetX + (driver.x - minX) * scale;
    const sy = offsetY + (maxY - driver.y) * scale;
    const isSelected = selectedDrivers.includes(driver.abbr);
    const radius = isSelected ? 8 : 5;

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(sx, sy, 13, 0, Math.PI * 2);
      ctx.fillStyle = `${driver.color}44`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = driver.color;
    ctx.fill();
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.stroke();

    ctx.font = isSelected ? "800 12px Aptos, sans-serif" : "800 10px Aptos, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(driver.abbr, sx, sy - radius - 6);
  }
}
