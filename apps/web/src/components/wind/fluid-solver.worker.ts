/**
 * Geometry-driven wind-tunnel field.
 *
 * This worker intentionally does not try to be CFD. It builds a signed-ish
 * distance/normal field from the supplied car mask, then produces a stable
 * illustrative velocity field that the renderer can trace as streamlines.
 *
 * Wire protocol:
 *
 *   IN  { type: "init", airspeed, mask, wheels, components }
 *   IN  { type: "set-mask", mask, wheels, components }
 *   IN  { type: "tick", airspeed, yawDeg, windSourceY, drsOpen, groundMode, wheelMode, diagnostic, mask?, wheels?, components? }
 *
 *   OUT { type: "frame", nx, ny,
 *         u: ArrayBuffer, v: ArrayBuffer, speed: ArrayBuffer, pressure: ArrayBuffer,
 *         drag, lift, frameIndex,
 *         bodyDistance?, bodyNormalX?, bodyNormalY?, bodyMask?, wheelMask?, wake?, ground?, components? }
 */

const NX = 320;
const NY = 144;
const N = NX * NY;
const BODY_INFLUENCE_RADIUS = 46;
const BODY_INFLUENCE_RADIUS_SQ = BODY_INFLUENCE_RADIUS * BODY_INFLUENCE_RADIUS;
const GROUND_Y = Math.floor(NY * 0.965);

type GroundMode = "rolling" | "fixed";
type WheelMode = "rotating" | "stationary";

interface WheelCell {
  cx: number;
  cy: number;
  r: number;
}

type WakeZoneKind = "rearWing" | "diffuser";

interface WakeZoneCell {
  kind: WakeZoneKind;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  strength: number;
}

const u = new Float32Array(N);
const v = new Float32Array(N);
const p = new Float32Array(N);
const speed = new Float32Array(N);
const bodyDistance = new Float32Array(N);
const bodyNormalX = new Float32Array(N);
const bodyNormalY = new Float32Array(N);
const wheelMask = new Uint8Array(N);
const wakeEnvelope = new Float32Array(N);
const groundChannel = new Float32Array(N);
const columnTop = new Int16Array(NX);
const columnBottom = new Int16Array(NX);
// Scratch buffers for the post-construction smoothing pass. The geometry field
// is stamped zone-by-zone, which can leave visible seams; a few Jacobi-style
// smoothing iterations blend those boundaries into continuous streamlines
// without turning this into a full pressure-projection solver.
const uScratch = new Float32Array(N);
const vScratch = new Float32Array(N);

let mask: Uint8Array<ArrayBufferLike> = new Uint8Array(N);
let wheels: WheelCell[] = [];
let componentWakeZones: WakeZoneCell[] = [];
let inletSpeed = 1.4;
let yawVelocity = 0;
let groundMode: GroundMode = "rolling";
let wheelMode: WheelMode = "rotating";
let drsOpen = false;
let frameIndex = 0;
let bodyBounds = {
  hasMask: false,
  minX: 0,
  maxX: 0,
  minY: 0,
  maxY: 0,
  centerY: NY * 0.5,
  noseY: NY * 0.5,
  rearY: NY * 0.5,
  area: 0,
};

function idx(x: number, y: number) {
  return y * NX + x;
}

function setGeometry(inputMask: unknown, inputWheels?: unknown, inputComponents?: unknown) {
  mask = normalizeMask(inputMask);
  wheels = normalizeWheels(inputWheels);
  rebuildWheelMask();
  rebuildBodyGeometry();
  const suppliedZones = normalizeWakeZones(inputComponents);
  componentWakeZones = suppliedZones.length ? suppliedZones : deriveWakeZones();
  clearFlow();
}

function setWheels(inputWheels: unknown) {
  wheels = normalizeWheels(inputWheels);
  rebuildWheelMask();
}

function rebuildBodyGeometry() {
  bodyDistance.fill(Number.POSITIVE_INFINITY);
  bodyNormalX.fill(0);
  bodyNormalY.fill(0);
  columnTop.fill(-1);
  columnBottom.fill(-1);

  const boundary: Array<[number, number]> = [];
  let minX = NX;
  let maxX = 0;
  let minY = NY;
  let maxY = 0;
  let sumY = 0;
  let area = 0;

  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = 1; x < NX - 1; x += 1) {
      const c = idx(x, y);
      if (!mask[c]) continue;

      bodyDistance[c] = 0;
      area += 1;
      sumY += y;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      columnTop[x] = columnTop[x] < 0 ? y : Math.min(columnTop[x], y);
      columnBottom[x] = Math.max(columnBottom[x], y);

      if (
        !mask[idx(x - 1, y)]
        || !mask[idx(x + 1, y)]
        || !mask[idx(x, y - 1)]
        || !mask[idx(x, y + 1)]
      ) {
        boundary.push([x, y]);
      }
    }
  }

  if (!area || boundary.length === 0) {
    bodyBounds = {
      hasMask: false,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      centerY: NY * 0.5,
      noseY: NY * 0.5,
      rearY: NY * 0.5,
      area: 0,
    };
    return;
  }

  const centerY = sumY / area;
  bodyBounds = {
    hasMask: true,
    minX,
    maxX,
    minY,
    maxY,
    centerY,
    noseY: averageMaskY(minX, Math.min(maxX, minX + Math.max(3, Math.floor((maxX - minX) * 0.08))), centerY),
    rearY: averageMaskY(Math.max(minX, maxX - Math.max(3, Math.floor((maxX - minX) * 0.12))), maxX, centerY),
    area,
  };

  const scanMinX = Math.max(1, minX - BODY_INFLUENCE_RADIUS);
  const scanMaxX = Math.min(NX - 2, maxX + BODY_INFLUENCE_RADIUS);
  const scanMinY = Math.max(1, minY - BODY_INFLUENCE_RADIUS);
  const scanMaxY = Math.min(NY - 2, maxY + BODY_INFLUENCE_RADIUS);

  for (let y = scanMinY; y <= scanMaxY; y += 1) {
    for (let x = scanMinX; x <= scanMaxX; x += 1) {
      const c = idx(x, y);
      if (mask[c]) continue;

      let bestSq = BODY_INFLUENCE_RADIUS_SQ + 1;
      let bestDx = 0;
      let bestDy = 0;
      for (const [bx, by] of boundary) {
        const dx = x - bx;
        if (Math.abs(dx) > BODY_INFLUENCE_RADIUS) continue;
        const dy = y - by;
        if (Math.abs(dy) > BODY_INFLUENCE_RADIUS) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestSq) {
          bestSq = d2;
          bestDx = dx;
          bestDy = dy;
        }
      }

      if (bestSq <= BODY_INFLUENCE_RADIUS_SQ) {
        const distance = Math.sqrt(Math.max(0.0001, bestSq));
        bodyDistance[c] = distance;
        bodyNormalX[c] = bestDx / distance;
        bodyNormalY[c] = bestDy / distance;
      }
    }
  }
}

function rebuildWheelMask() {
  wheelMask.fill(0);
  for (let y = 0; y < NY; y += 1) {
    for (let x = 0; x < NX; x += 1) {
      for (const wheel of wheels) {
        if (Math.hypot(x + 0.5 - wheel.cx, y + 0.5 - wheel.cy) <= wheel.r) {
          wheelMask[idx(x, y)] = 1;
          break;
        }
      }
    }
  }
}

function deriveWakeZones(): WakeZoneCell[] {
  if (!bodyBounds.hasMask) return [];
  const length = Math.max(1, bodyBounds.maxX - bodyBounds.minX);
  const height = Math.max(1, bodyBounds.maxY - bodyBounds.minY);
  const rearColumnX = Math.max(bodyBounds.minX, Math.round(bodyBounds.maxX - length * 0.035));
  const upperRear = columnTopAt(rearColumnX);
  const lowerRear = columnBottomAt(rearColumnX);
  return [
    {
      kind: "rearWing",
      x: bodyBounds.maxX,
      y: upperRear >= 0 ? upperRear + height * 0.16 : bodyBounds.rearY - height * 0.24,
      radiusX: Math.max(5, length * 0.035),
      radiusY: Math.max(5, height * 0.15),
      strength: 0.95,
    },
    {
      kind: "diffuser",
      x: Math.max(bodyBounds.minX, bodyBounds.maxX - length * 0.045),
      y: lowerRear >= 0 ? lowerRear - height * 0.05 : bodyBounds.rearY + height * 0.25,
      radiusX: Math.max(5, length * 0.045),
      radiusY: Math.max(4, height * 0.12),
      strength: 0.82,
    },
  ];
}

function averageMaskY(x0: number, x1: number, fallback: number) {
  let total = 0;
  let count = 0;
  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = Math.max(1, x0); x <= Math.min(NX - 2, x1); x += 1) {
      if (mask[idx(x, y)]) {
        total += y;
        count += 1;
      }
    }
  }
  return count ? total / count : fallback;
}

function clearFlow() {
  u.fill(0);
  v.fill(0);
  p.fill(0);
  speed.fill(0);
  wakeEnvelope.fill(0);
  groundChannel.fill(0);
  frameIndex = 0;
}

function buildInletProfile(speedMps: number, yawDeg: number, windSourceY: number) {
  const normalized = Math.max(0, speedMps) / 60;
  const yawRad = (yawDeg * Math.PI) / 180;
  inletSpeed = normalized * Math.cos(yawRad);
  yawVelocity = normalized * Math.sin(yawRad);

  const inlet = { u: new Float32Array(NY), v: new Float32Array(NY) };
  for (let y = 0; y < NY; y += 1) {
    const floorDistance = (NY - 1 - y) / (NY - 1);
    const boundaryLayer = groundMode === "rolling"
      ? 1.02 + floorDistance * 0.045
      : 0.18 + 0.82 * smooth01(floorDistance / 0.34);
    const rakeDistance = y / (NY - 1) - windSourceY;
    const rakeBoost = 1 + 0.075 * Math.exp(-(rakeDistance * rakeDistance) / 0.008);
    inlet.u[y] = inletSpeed * boundaryLayer * rakeBoost;
    inlet.v[y] = yawVelocity * boundaryLayer * rakeBoost;
  }
  return inlet;
}

function buildVelocityField(inlet: { u: Float32Array; v: Float32Array }) {
  const inletMag = Math.max(0.08, Math.hypot(inletSpeed, yawVelocity));
  const windX = inletSpeed / inletMag;
  const windY = yawVelocity / inletMag;
  wakeEnvelope.fill(0);
  groundChannel.fill(0);

  for (let y = 0; y < NY; y += 1) {
    for (let x = 0; x < NX; x += 1) {
      const c = idx(x, y);
      if (mask[c]) {
        u[c] = 0;
        v[c] = 0;
        p[c] = 0.55;
        speed[c] = 0;
        continue;
      }

      let uu = inlet.u[y];
      let vv = inlet.v[y];
      let pressure = 0;

      if (bodyBounds.hasMask) {
        const shaped = applyBodyInfluence(x, y, c, uu, vv, pressure, inletMag, windX, windY);
        uu = shaped.u;
        vv = shaped.v;
        pressure = shaped.pressure;

        const floor = applyGroundEffect(x, y, uu, vv, pressure, inletMag);
        uu = floor.u;
        vv = floor.v;
        pressure = floor.pressure;

        const wake = applyWakeDeficit(x, y, uu, vv, pressure, inletMag);
        uu = wake.u;
        vv = wake.v;
        pressure = wake.pressure;
      }

      const wheel = applyWheelEffects(x, y, uu, vv, pressure, inletMag);
      uu = wheel.u;
      vv = wheel.v;
      pressure = wheel.pressure;

      const limited = limitVelocity(uu, vv, inletMag * 2.15);
      u[c] = limited.u;
      v[c] = limited.v;
      p[c] = pressure + 0.5 * (inletMag * inletMag - (limited.u * limited.u + limited.v * limited.v));
    }
  }

  enforceNoPenetration();
  smoothField(2);
  for (let i = 0; i < N; i += 1) {
    if (mask[i]) {
      speed[i] = 0;
    } else {
      speed[i] = Math.hypot(u[i], v[i]);
    }
  }
}

/**
 * Edge-aware smoothing of the constructed velocity field. Each pass replaces a
 * free cell's velocity with a weighted blend of itself and its non-masked
 * neighbours, so the seams between the inlet / body / ground / wake / wheel
 * zones dissolve into continuous streamlines. Masked cells and their immediate
 * boundary are skipped so the no-penetration condition is preserved.
 */
function smoothField(passes: number) {
  if (!bodyBounds.hasMask) return;
  const minX = Math.max(1, bodyBounds.minX - BODY_INFLUENCE_RADIUS);
  const maxX = Math.min(NX - 2, bodyBounds.maxX + Math.floor(BODY_INFLUENCE_RADIUS * 1.6));
  const minY = Math.max(1, bodyBounds.minY - BODY_INFLUENCE_RADIUS);
  const maxY = Math.min(NY - 2, bodyBounds.maxY + BODY_INFLUENCE_RADIUS);
  const center = 0.5;
  const side = (1 - center) / 4;
  for (let pass = 0; pass < passes; pass += 1) {
    uScratch.set(u);
    vScratch.set(v);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const c = idx(x, y);
        if (mask[c]) continue;
        // Don't smooth cells touching the body; keep the boundary crisp.
        if (mask[c - 1] || mask[c + 1] || mask[c - NX] || mask[c + NX]) continue;
        const uN = uScratch[c - NX];
        const uS = uScratch[c + NX];
        const uW = uScratch[c - 1];
        const uE = uScratch[c + 1];
        const vN = vScratch[c - NX];
        const vS = vScratch[c + NX];
        const vW = vScratch[c - 1];
        const vE = vScratch[c + 1];
        u[c] = uScratch[c] * center + (uN + uS + uW + uE) * side;
        v[c] = vScratch[c] * center + (vN + vS + vW + vE) * side;
      }
    }
  }
}

function applyBodyInfluence(
  x: number,
  y: number,
  c: number,
  uu: number,
  vv: number,
  pressure: number,
  inletMag: number,
  windX: number,
  windY: number,
) {
  const distance = bodyDistance[c];
  const length = Math.max(1, bodyBounds.maxX - bodyBounds.minX);
  const height = Math.max(1, bodyBounds.maxY - bodyBounds.minY);

  if (distance > 0 && distance < BODY_INFLUENCE_RADIUS) {
    const influence = smooth01(1 - distance / BODY_INFLUENCE_RADIUS);
    const nx = bodyNormalX[c];
    const ny = bodyNormalY[c];
    const normalFlow = uu * nx + vv * ny;

    if (normalFlow < 0) {
      const remove = -normalFlow * (0.96 + influence * 0.22);
      uu += nx * remove;
      vv += ny * remove;
      pressure += (remove / inletMag) * 0.34 * influence;
    }

    const windNormal = windX * nx + windY * ny;
    let tx = windX - nx * windNormal;
    let ty = windY - ny * windNormal;
    const tMag = Math.hypot(tx, ty);
    if (tMag > 0.001) {
      tx /= tMag;
      ty /= tMag;
      const upperSurface = ny < -0.16 ? 1 : 0;
      const lowerSurface = ny > 0.16 ? 1 : 0;
      const bodyT = clamp((x - bodyBounds.minX) / length, 0, 1);
      const shoulder = Math.exp(-Math.pow((bodyT - 0.40) / 0.23, 2));
      const diffuser = Math.exp(-Math.pow((bodyT - 0.78) / 0.20, 2));
      const accel = influence * (
        0.08
        + upperSurface * (0.30 + 0.10 * shoulder)
        + lowerSurface * (0.13 + 0.14 * diffuser)
      );
      uu += tx * inletMag * accel;
      vv += ty * inletMag * accel;
      pressure -= accel * inletMag * 0.30;
    }
  }

  const frontWindow = x > bodyBounds.minX - length * 0.16 && x < bodyBounds.minX + length * 0.24;
  if (frontWindow) {
    const dx = (x - (bodyBounds.minX + length * 0.035)) / (length * 0.20);
    const dy = (y - bodyBounds.noseY) / (height * 0.85);
    const nose = Math.exp(-(dx * dx * 2.1 + dy * dy * 1.65));
    if (nose > 0.006) {
      const split = y < bodyBounds.noseY ? -1 : 1;
      uu *= 1 - nose * 0.58;
      vv += split * inletMag * nose * 0.30;
      pressure += nose * inletMag * 0.58;
    }
  }

  return { u: uu, v: vv, pressure };
}

function applyGroundEffect(x: number, y: number, uu: number, vv: number, pressure: number, inletMag: number) {
  if (x < bodyBounds.minX || x > bodyBounds.maxX || y >= GROUND_Y) {
    return { u: uu, v: vv, pressure };
  }

  const bottom = columnBottomAt(x);
  if (bottom < 0 || y <= bottom || y >= GROUND_Y) {
    return { u: uu, v: vv, pressure };
  }

  const gap = Math.max(2, GROUND_Y - bottom);
  const gapT = (y - bottom) / gap;
  const length = Math.max(1, bodyBounds.maxX - bodyBounds.minX);
  const bodyT = clamp((x - bodyBounds.minX) / length, 0, 1);
  const window = smooth01(bodyT / 0.16) * smooth01((1 - bodyT) / 0.20);
  const channel = Math.exp(-Math.pow((gapT - 0.32) / 0.34, 2)) * window;
  const rolling = groundMode === "rolling";
  const boost = channel * (rolling ? 0.66 : 0.15);
  const diffuserExpansion = Math.exp(-Math.pow((bodyT - 0.86) / 0.14, 2)) * channel;

  uu += inletMag * boost;
  vv += inletMag * channel * (rolling ? -0.045 : 0.024);
  vv -= inletMag * diffuserExpansion * (rolling ? 0.055 : 0.016);
  pressure -= inletMag * boost * (rolling ? 0.72 : 0.38);
  groundChannel[idx(x, y)] = Math.max(groundChannel[idx(x, y)], channel * (rolling ? 1 : 0.42));
  return { u: uu, v: vv, pressure };
}

function applyWakeDeficit(x: number, y: number, uu: number, vv: number, pressure: number, inletMag: number) {
  const length = Math.max(1, bodyBounds.maxX - bodyBounds.minX);
  const height = Math.max(1, bodyBounds.maxY - bodyBounds.minY);
  let nextU = uu;
  let nextV = vv;
  let nextPressure = pressure;

  for (const zone of componentWakeZones) {
    const originX = Math.max(zone.x, bodyBounds.minX);
    if (x < originX) continue;

    const dx = x - originX;
    const maxWakeLength = zone.kind === "rearWing"
      ? length * (drsOpen ? 0.25 : 0.46)
      : length * 0.32;
    const wakeLength = Math.min(NX - originX - 1, Math.max(zone.radiusX * 3.2, maxWakeLength));
    if (wakeLength <= 2 || dx > wakeLength) continue;

    const t = clamp(dx / wakeLength, 0, 1);
    const drsScale = zone.kind === "rearWing" && drsOpen ? 0.28 : 1;
    const groundScale = zone.kind === "diffuser"
      ? (groundMode === "rolling" ? 1.12 : 0.46)
      : 1;
    const baseRadius = zone.kind === "rearWing"
      ? zone.radiusY * (drsOpen ? (0.95 + t * 0.52) : (1.10 + t * 1.46))
      : zone.radiusY * (0.78 + t * 1.08);
    const center = zone.kind === "rearWing"
      ? zone.y + height * 0.12 * t
      : zone.y - height * 0.12 * t;
    const dy = (y - center) / Math.max(1, baseRadius);
    const cross = Math.exp(-dy * dy * (zone.kind === "rearWing" ? 2.15 : 2.65));
    const decay = Math.pow(Math.max(0, 1 - t), zone.kind === "rearWing" ? 0.74 : 0.92);
    const zoneStrength = zone.strength * drsScale * groundScale;
    const deficit = cross * decay * zoneStrength * (zone.kind === "rearWing" ? 0.36 : 0.17);
    if (deficit <= 0.0008) continue;

    // Von-Karman-style alternating vortex street: the transverse velocity
    // oscillates in time and along the wake, and flips sign across the wake
    // centerline so vortices shed alternately top/bottom. Shedding frequency
    // scales with the inlet speed (Strouhal-like) and the street grows just
    // downstream of the body before decaying into the far wake.
    const sideSign = y < center ? 1 : -1;
    const sheddingPhase = frameIndex * (0.06 + inletMag * 0.05) + t * 9.0 + zone.y * 0.05;
    const streetGrowth = Math.sin(Math.min(Math.PI, t * Math.PI * 1.18)); // 0 at body, peak mid-wake, fades far
    const shear = Math.sin(sheddingPhase) * sideSign * cross * decay * streetGrowth;
    const convergence = clamp((center - y) / Math.max(1, baseRadius), -1, 1) * cross * decay;
    nextU *= 1 - deficit;
    // Pull a little streamwise momentum out at the vortex cores for a livelier
    // wobble in the streaklines.
    nextU -= Math.abs(shear) * inletMag * 0.05 * zone.strength;
    if (zone.kind === "rearWing") {
      nextV += convergence * inletMag * (drsOpen ? 0.030 : 0.155) * zone.strength;
      nextV += shear * inletMag * (drsOpen ? 0.045 : 0.105) * zone.strength;
    } else {
      nextV -= cross * decay * inletMag * (groundMode === "rolling" ? 0.072 : 0.022) * zone.strength;
      nextV += shear * inletMag * (groundMode === "rolling" ? 0.060 : 0.030) * zone.strength;
    }
    nextPressure -= deficit * inletMag * (zone.kind === "rearWing" ? 0.55 : 0.38);
    wakeEnvelope[idx(x, y)] = Math.max(wakeEnvelope[idx(x, y)], cross * decay * zoneStrength);
  }

  return { u: nextU, v: nextV, pressure: nextPressure };
}

function applyWheelEffects(x: number, y: number, uu: number, vv: number, pressure: number, inletMag: number) {
  const bodyLength = bodyBounds.hasMask ? Math.max(1, bodyBounds.maxX - bodyBounds.minX) : NX;
  const rearSplit = bodyBounds.hasMask ? bodyBounds.minX + bodyLength * 0.56 : NX * 0.5;
  for (const wheel of wheels) {
    const dx = x - wheel.cx;
    const dy = y - wheel.cy;
    const d = Math.hypot(dx, dy);
    const rotating = wheelMode === "rotating";
    const isRearWheel = wheel.cx >= rearSplit;

    const outer = wheel.r * (rotating ? 1.92 : 1.42);
    if (d <= outer && d >= Math.max(1, wheel.r * 0.70)) {
      // Rotating-surface boundary drag tied to the wheel geometry. A wheel
      // rolling with the road has its contact patch moving downstream (+x) at
      // the ground speed and its crown moving upstream (-x). Modelling that as
      // a rigid-body surface velocity field v = k * (dy, -dx) with
      // k = surfaceSpeed / r gives the realistic asymmetric wake: flow over the
      // crown is retarded/separates while the lower flow is dragged forward.
      const proximity = Math.exp(-Math.pow((d - wheel.r * 1.04) / Math.max(1, wheel.r * 0.42), 2));
      // Surface speed scales with the rolling road; a stationary wheel still
      // sheds a weak ring but with no net surface motion (no-slip).
      const surfaceSpeed = (groundMode === "rolling" ? inletMag : inletMag * 0.55)
        * (rotating ? 1 : 0.12);
      const k = surfaceSpeed / Math.max(1, wheel.r);
      const surfaceU = k * dy;
      const surfaceV = -k * dx;
      // Blend cell velocity toward the moving surface within the band.
      const blend = proximity * (rotating ? 0.42 : 0.16);
      uu += (surfaceU - uu) * blend;
      vv += (surfaceV - vv) * blend;
      // Crown (top, dy < 0) sees a low-pressure suction when spinning.
      const crown = Math.max(0, -dy / Math.max(1, wheel.r));
      pressure -= proximity * crown * surfaceSpeed * 0.10;
    }

    const wakeOrigin = wheel.cx + wheel.r * 0.58;
    const wakeLength = wheel.r * (isRearWheel ? 4.15 : 2.35);
    if (x > wakeOrigin && x < wakeOrigin + wakeLength) {
      const wakeT = (x - wakeOrigin) / wakeLength;
      const wakeRadius = wheel.r * (0.68 + wakeT * (isRearWheel ? 0.95 : 0.58));
      const wakeCross = Math.exp(-Math.pow(dy / Math.max(1, wakeRadius), 2) * 1.55);
      const wakeScale = (rotating ? 0.12 : 0.035) * (isRearWheel ? 1 : 0.45);
      const deficit = wakeCross * Math.pow(Math.max(0, 1 - wakeT), 0.82) * wakeScale;
      uu *= 1 - deficit;
      vv += Math.sin(frameIndex * 0.15 + wakeT * 5.4 + wheel.cx * 0.05) * inletMag * deficit * (rotating ? 0.26 : 0.06);
      pressure -= deficit * inletMag * 0.26;
      wakeEnvelope[idx(x, y)] = Math.max(wakeEnvelope[idx(x, y)], deficit * (rotating ? 5.2 : 2.2));
    }
  }
  return { u: uu, v: vv, pressure };
}

function enforceNoPenetration() {
  if (!bodyBounds.hasMask) return;
  const minX = Math.max(1, bodyBounds.minX - BODY_INFLUENCE_RADIUS);
  const maxX = Math.min(NX - 2, bodyBounds.maxX + BODY_INFLUENCE_RADIUS);
  const minY = Math.max(1, bodyBounds.minY - BODY_INFLUENCE_RADIUS);
  const maxY = Math.min(NY - 2, bodyBounds.maxY + BODY_INFLUENCE_RADIUS);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const c = idx(x, y);
      if (mask[c]) {
        u[c] = 0;
        v[c] = 0;
        continue;
      }
      const distance = bodyDistance[c];
      if (!(distance > 0 && distance < BODY_INFLUENCE_RADIUS)) continue;
      const nx = bodyNormalX[c];
      const ny = bodyNormalY[c];
      const normalFlow = u[c] * nx + v[c] * ny;
      if (normalFlow < 0) {
        u[c] -= nx * normalFlow;
        v[c] -= ny * normalFlow;
      }
    }
  }
}

function computeForces() {
  if (!bodyBounds.hasMask) return { drag: 0, lift: 0 };

  let pressureDrag = 0;
  let lift = 0;
  let exposedVerticalFaces = 0;
  let exposedHorizontalFaces = 0;

  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = 1; x < NX - 1; x += 1) {
      if (!mask[idx(x, y)]) continue;

      if (!mask[idx(x - 1, y)]) {
        pressureDrag += Math.max(0, p[idx(x - 1, y)]);
        exposedVerticalFaces += 1;
      }
      if (!mask[idx(x + 1, y)]) {
        pressureDrag -= Math.min(0.4, p[idx(x + 1, y)] * 0.45);
        exposedVerticalFaces += 1;
      }
      if (!mask[idx(x, y - 1)]) {
        lift += p[idx(x, y - 1)];
        exposedHorizontalFaces += 1;
      }
      if (!mask[idx(x, y + 1)]) {
        lift -= p[idx(x, y + 1)];
        exposedHorizontalFaces += 1;
      }
    }
  }

  let wakeDeficit = 0;
  let wakeSamples = 0;
  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = 1; x < NX - 1; x += 1) {
      const c = idx(x, y);
      const wake = wakeEnvelope[c];
      if (wake <= 0.035 || mask[c]) continue;
      wakeDeficit += Math.max(0, inletSpeed - u[c]) * wake;
      wakeSamples += wake;
    }
  }

  if (wakeSamples <= 0.001) {
    const wakeStart = Math.min(NX - 2, bodyBounds.maxX + 1);
    const wakeEnd = Math.min(NX - 2, bodyBounds.maxX + Math.max(26, Math.floor((bodyBounds.maxX - bodyBounds.minX) * 0.24)));
    const wakeMinY = Math.max(1, Math.floor(bodyBounds.rearY - (bodyBounds.maxY - bodyBounds.minY) * 0.34));
    const wakeMaxY = Math.min(NY - 2, Math.ceil(bodyBounds.rearY + (bodyBounds.maxY - bodyBounds.minY) * 0.34));
    for (let y = wakeMinY; y <= wakeMaxY; y += 1) {
      for (let x = wakeStart; x <= wakeEnd; x += 1) {
        if (mask[idx(x, y)]) continue;
        wakeDeficit += Math.max(0, inletSpeed - u[idx(x, y)]);
        wakeSamples += 1;
      }
    }
  }

  const dynamicPressure = Math.max(0.08, inletSpeed * inletSpeed + yawVelocity * yawVelocity);
  const projectedHeight = Math.max(1, bodyBounds.maxY - bodyBounds.minY + 1);
  const pressureTerm = Math.max(0, pressureDrag) / (dynamicPressure * Math.max(1, exposedVerticalFaces));
  const wakeTerm = wakeSamples ? (wakeDeficit / wakeSamples) / dynamicPressure : 0;
  const blockageTerm = (projectedHeight / NY) * 1.15 + (bodyBounds.area / N) * 2.8;
  // Rolling road and rotating wheels both clean up the floor/wheel flow
  // relative to a fixed-floor tunnel: the moving ground removes the parasitic
  // boundary layer and rotating wheels shed a tighter wake. Educationally we
  // model both as a legible drag reduction (and downforce gain) so the toggles
  // produce a clearly measurable response instead of a sub-1% wobble that the
  // convergence detector reads as noise.
  const groundDragFactor = groundMode === "rolling" ? 0.95 : 1.05;
  const wheelDragFactor = wheelMode === "rotating" ? 0.96 : 1.04;
  // The pressure/wake terms are normalized by dynamic pressure (coefficient
  // form), so re-scale the displayed force by q relative to the default
  // 80 mph inlet. Without this, raising airspeed *lowered* the drag readout,
  // which reads as broken physics in an educational tunnel.
  const referenceQ = (80 / 60) * (80 / 60);
  const forceScale = dynamicPressure / referenceQ;
  const drag = Math.max(0, pressureTerm * 0.55 + wakeTerm * 0.95 + blockageTerm)
    * forceScale
    * (drsOpen ? 0.82 : 1)
    * groundDragFactor
    * wheelDragFactor;

  const normalizedLift = exposedHorizontalFaces
    ? lift / (dynamicPressure * exposedHorizontalFaces)
    : 0;
  const groundLift = groundMode === "rolling" ? -0.055 : 0.020;
  const wheelLift = wheelMode === "rotating" ? -0.012 : 0.004;
  return { drag, lift: (normalizedLift * 0.32 + groundLift + wheelLift) * forceScale };
}

function columnTopAt(x: number) {
  const xi = Math.max(0, Math.min(NX - 1, Math.round(x)));
  if (columnTop[xi] >= 0) return columnTop[xi];
  for (let offset = 1; offset <= 5; offset += 1) {
    const left = xi - offset;
    const right = xi + offset;
    if (left >= 0 && columnTop[left] >= 0) return columnTop[left];
    if (right < NX && columnTop[right] >= 0) return columnTop[right];
  }
  return -1;
}

function columnBottomAt(x: number) {
  const xi = Math.max(0, Math.min(NX - 1, Math.round(x)));
  if (columnBottom[xi] >= 0) return columnBottom[xi];
  for (let offset = 1; offset <= 5; offset += 1) {
    const left = xi - offset;
    const right = xi + offset;
    if (left >= 0 && columnBottom[left] >= 0) return columnBottom[left];
    if (right < NX && columnBottom[right] >= 0) return columnBottom[right];
  }
  return -1;
}

function limitVelocity(uu: number, vv: number, maxSpeed: number) {
  const mag = Math.hypot(uu, vv);
  if (mag <= maxSpeed || mag <= 0.0001) return { u: uu, v: vv };
  const scale = maxSpeed / mag;
  return { u: uu * scale, v: vv * scale };
}

function smooth01(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function normalizeMask(input: unknown): Uint8Array<ArrayBufferLike> {
  if (input instanceof Uint8Array && input.length === N) return new Uint8Array(input);
  if (input instanceof Uint8Array) {
    const next = new Uint8Array(N);
    next.set(input.subarray(0, Math.min(input.length, N)));
    return next;
  }
  return new Uint8Array(N);
}

function normalizeWheels(input: unknown): WheelCell[] {
  if (!Array.isArray(input)) return [];
  const normalized: WheelCell[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const source = item as { cx?: unknown; cy?: unknown; r?: unknown };
    const cx = Number(source.cx);
    const cy = Number(source.cy);
    const r = Number(source.r);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r <= 0) continue;
    normalized.push({
      cx: clamp(clamp01(cx) * (NX - 1), 1, NX - 2),
      cy: clamp(clamp01(cy) * (NY - 1), 1, NY - 2),
      r: clamp(r * NY, 3, 28),
    });
  }
  return normalized;
}

function normalizeWakeZones(input: unknown): WakeZoneCell[] {
  if (!Array.isArray(input)) return [];
  const normalized: WakeZoneCell[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const source = item as {
      kind?: unknown;
      x?: unknown;
      y?: unknown;
      radiusX?: unknown;
      radiusY?: unknown;
      strength?: unknown;
    };
    const kind = source.kind === "diffuser" ? "diffuser" : source.kind === "rearWing" ? "rearWing" : null;
    if (!kind) continue;
    const x = Number(source.x);
    const y = Number(source.y);
    const radiusX = Number(source.radiusX);
    const radiusY = Number(source.radiusY);
    const strength = Number(source.strength);
    if (
      !Number.isFinite(x)
      || !Number.isFinite(y)
      || !Number.isFinite(radiusX)
      || !Number.isFinite(radiusY)
    ) {
      continue;
    }
    normalized.push({
      kind,
      x: clamp(clamp01(x) * (NX - 1), 1, NX - 2),
      y: clamp(clamp01(y) * (NY - 1), 1, NY - 2),
      radiusX: clamp(Math.abs(radiusX) * NX, 4, 70),
      radiusY: clamp(Math.abs(radiusY) * NY, 3, 34),
      strength: clamp(Number.isFinite(strength) ? strength : 1, 0.1, 1.8),
    });
  }
  return normalized;
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === "init") {
    setGeometry(data.mask, data.wheels, data.components);
    inletSpeed = (data.airspeed ?? 80) / 60;
    self.postMessage({ type: "ready", nx: NX, ny: NY });
    return;
  }

  if (data.type === "set-mask") {
    setGeometry(data.mask, data.wheels, data.components);
    return;
  }

  if (data.type === "tick") {
    if (data.mask) {
      setGeometry(data.mask, data.wheels, data.components);
    } else if (data.wheels) {
      setWheels(data.wheels);
      if (data.components) {
        const suppliedZones = normalizeWakeZones(data.components);
        componentWakeZones = suppliedZones.length ? suppliedZones : deriveWakeZones();
      }
    }
    groundMode = data.groundMode === "fixed" ? "fixed" : "rolling";
    wheelMode = data.wheelMode === "stationary" ? "stationary" : "rotating";
    drsOpen = Boolean(data.drsOpen);

    const profile = buildInletProfile(data.airspeed ?? 80, data.yawDeg ?? 0, clamp01(data.windSourceY ?? 0.48));
    buildVelocityField(profile);
    const forces = computeForces();
    frameIndex += 1;
    const diagnostic = Boolean(data.diagnostic);

    self.postMessage({
      type: "frame",
      nx: NX,
      ny: NY,
      u: u.slice().buffer,
      v: v.slice().buffer,
      speed: speed.slice().buffer,
      pressure: p.slice().buffer,
      drag: forces.drag,
      lift: forces.lift,
      frameIndex,
      ...(diagnostic ? {
        bodyDistance: bodyDistance.slice().buffer,
        bodyNormalX: bodyNormalX.slice().buffer,
        bodyNormalY: bodyNormalY.slice().buffer,
        bodyMask: mask.slice().buffer,
        wheelMask: wheelMask.slice().buffer,
        wake: wakeEnvelope.slice().buffer,
        ground: groundChannel.slice().buffer,
        bodyInfluenceRadius: BODY_INFLUENCE_RADIUS,
        components: componentWakeZones.map((zone) => ({
          kind: zone.kind,
          x: zone.x / (NX - 1),
          y: zone.y / (NY - 1),
          radiusX: zone.radiusX / NX,
          radiusY: zone.radiusY / NY,
          strength: zone.strength,
        })),
      } : {}),
    });
  }
});
