/**
 * Stable-Fluids Web Worker (rewritten 2026-05-22).
 *
 * 2D incompressible Navier-Stokes solver based on Jos Stam's "Stable Fluids"
 * (1999) approach: semi-Lagrangian advection + Jacobi pressure projection.
 * Runs in a Worker so the main UI thread stays responsive.
 *
 * Wire protocol (postMessage):
 *
 *   IN  { type: "init", airspeed, mask }
 *   IN  { type: "set-mask", mask }
 *   IN  { type: "tick", airspeed, yawDeg, windSourceY, groundMode, wheelMode, mask?, subSteps? }
 *
 *   OUT { type: "frame", nx, ny,
 *         u: ArrayBuffer (Float32Array NX*NY),
 *         v: ArrayBuffer (Float32Array NX*NY),
 *         speed: ArrayBuffer (Float32Array NX*NY),
 *         pressure: ArrayBuffer (Float32Array NX*NY),
 *         drag, lift }
 *
 * Compared to the previous version we now ship u + v separately (so particle
 * streaklines can curl and deflect over the body) and the pressure field (so
 * the renderer can paint a Cp tint along the boundary instead of a noisy
 * volumetric heat-fill). The simulation is illustrative, not a measured
 * aerodynamic result, and the wind tunnel UI labels it as such.
 */

const NX = 320; // grid columns
const NY = 144; // grid rows
const N = NX * NY;
const DT = 0.045;
const VISCOSITY = 0.00018;
const PRESSURE_ITER = 20;

const u = new Float32Array(N);
const v = new Float32Array(N);
const u0 = new Float32Array(N);
const v0 = new Float32Array(N);
const p = new Float32Array(N);
const div = new Float32Array(N);
const speed = new Float32Array(N);
let mask: Uint8Array<ArrayBufferLike> = new Uint8Array(N);
let inletSpeed = 1.4;
let yawVelocity = 0;
let groundMode: "rolling" | "fixed" = "rolling";
let wheelMode: "rotating" | "stationary" = "rotating";

function idx(x: number, y: number) {
  return y * NX + x;
}

function setBoundaries(field: Float32Array, isVerticalComponent: boolean) {
  // Walls: top + bottom slip, left = inlet (Dirichlet), right = outflow.
  for (let y = 0; y < NY; y += 1) {
    field[idx(0, y)] = isVerticalComponent ? yawVelocity : inletSpeed;
    field[idx(NX - 1, y)] = field[idx(NX - 2, y)];
  }
  for (let x = 0; x < NX; x += 1) {
    field[idx(x, 0)] = isVerticalComponent ? 0 : field[idx(x, 1)];
    field[idx(x, NY - 1)] = isVerticalComponent
      ? 0
      : groundMode === "rolling"
        ? inletSpeed
        : field[idx(x, NY - 2)] * 0.35;
  }
  // No-slip at obstacle cells.
  for (let i = 0; i < N; i += 1) {
    if (mask[i]) field[i] = 0;
  }
}

function diffuse(field: Float32Array, source: Float32Array, rate: number, isVertical: boolean) {
  const a = DT * rate * NX * NY;
  for (let iter = 0; iter < 4; iter += 1) {
    for (let y = 1; y < NY - 1; y += 1) {
      for (let x = 1; x < NX - 1; x += 1) {
        if (mask[idx(x, y)]) continue;
        const c = idx(x, y);
        field[c] = (source[c]
          + a * (field[idx(x - 1, y)] + field[idx(x + 1, y)] + field[idx(x, y - 1)] + field[idx(x, y + 1)])
        ) / (1 + 4 * a);
      }
    }
    setBoundaries(field, isVertical);
  }
}

function advect(field: Float32Array, source: Float32Array, fieldU: Float32Array, fieldV: Float32Array, isVertical: boolean) {
  const dt0x = DT * NX;
  const dt0y = DT * NY;
  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = 1; x < NX - 1; x += 1) {
      const c = idx(x, y);
      if (mask[c]) { field[c] = 0; continue; }
      let bx = x - dt0x * fieldU[c];
      let by = y - dt0y * fieldV[c];
      if (bx < 0.5) bx = 0.5;
      if (bx > NX - 1.5) bx = NX - 1.5;
      if (by < 0.5) by = 0.5;
      if (by > NY - 1.5) by = NY - 1.5;
      const i0 = Math.floor(bx);
      const i1 = i0 + 1;
      const j0 = Math.floor(by);
      const j1 = j0 + 1;
      const s1 = bx - i0;
      const s0 = 1 - s1;
      const t1 = by - j0;
      const t0 = 1 - t1;
      field[c] = s0 * (t0 * source[idx(i0, j0)] + t1 * source[idx(i0, j1)])
               + s1 * (t0 * source[idx(i1, j0)] + t1 * source[idx(i1, j1)]);
    }
  }
  setBoundaries(field, isVertical);
}

function project() {
  const h = 1 / NX;
  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = 1; x < NX - 1; x += 1) {
      const c = idx(x, y);
      if (mask[c]) { div[c] = 0; p[c] = 0; continue; }
      div[c] = -0.5 * h * (
        u[idx(x + 1, y)] - u[idx(x - 1, y)]
        + v[idx(x, y + 1)] - v[idx(x, y - 1)]
      );
      p[c] = 0;
    }
  }
  for (let iter = 0; iter < PRESSURE_ITER; iter += 1) {
    for (let y = 1; y < NY - 1; y += 1) {
      for (let x = 1; x < NX - 1; x += 1) {
        const c = idx(x, y);
        if (mask[c]) continue;
        p[c] = (div[c] + p[idx(x - 1, y)] + p[idx(x + 1, y)] + p[idx(x, y - 1)] + p[idx(x, y + 1)]) / 4;
      }
    }
  }
  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = 1; x < NX - 1; x += 1) {
      const c = idx(x, y);
      if (mask[c]) continue;
      u[c] -= 0.5 * (p[idx(x + 1, y)] - p[idx(x - 1, y)]) / h;
      v[c] -= 0.5 * (p[idx(x, y + 1)] - p[idx(x, y - 1)]) / h;
    }
  }
  setBoundaries(u, false);
  setBoundaries(v, true);
}

function injectInlet(inlet: { u: Float32Array; v: Float32Array }) {
  for (let y = 1; y < NY - 1; y += 1) {
    const incoming = inlet.u[y];
    const crossflow = inlet.v[y];
    u[idx(0, y)] = incoming;
    u[idx(1, y)] = incoming * 0.96;
    v[idx(0, y)] = crossflow;
    v[idx(1, y)] = crossflow * 0.96;
  }

  if (wheelMode === "rotating") {
    stirWheelWake(0.24, 0.83, 1);
    stirWheelWake(0.78, 0.83, -1);
  }
}

function stirWheelWake(nx: number, ny: number, direction: number) {
  const cx = Math.round(nx * NX);
  const cy = Math.round(ny * NY);
  const radius = 10;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    if (y <= 1 || y >= NY - 1) continue;
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x <= 1 || x >= NX - 1) continue;
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      const fade = 1 - d2 / (radius * radius);
      const c = idx(x, y);
      u[c] += -dy * 0.0028 * direction * fade;
      v[c] += dx * 0.0028 * direction * fade;
    }
  }
}

function step(inlet: { u: Float32Array; v: Float32Array }) {
  injectInlet(inlet);
  u0.set(u);
  v0.set(v);
  diffuse(u, u0, VISCOSITY, false);
  diffuse(v, v0, VISCOSITY, true);
  project();
  u0.set(u);
  v0.set(v);
  advect(u, u0, u0, v0, false);
  advect(v, v0, u0, v0, true);
  project();
  for (let i = 0; i < N; i += 1) speed[i] = Math.hypot(u[i], v[i]);
}

function computeForces() {
  // Approximate drag and lift on the obstacle by integrating the pressure
  // difference across mask boundary cells. Not a quantitative Cd/Cl, just an
  // illustrative readout.
  let drag = 0;
  let lift = 0;
  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = 1; x < NX - 1; x += 1) {
      if (!mask[idx(x, y)]) continue;
      const left = mask[idx(x - 1, y)] ? 0 : p[idx(x - 1, y)];
      const right = mask[idx(x + 1, y)] ? 0 : p[idx(x + 1, y)];
      drag += left - right;
      const above = mask[idx(x, y - 1)] ? 0 : p[idx(x, y - 1)];
      const below = mask[idx(x, y + 1)] ? 0 : p[idx(x, y + 1)];
      lift += above - below;
    }
  }
  return { drag, lift };
}

function buildInletProfile(speedMps: number, yawDeg: number, windSourceY: number) {
  const normalized = speedMps / 60; // normalize against grid scale
  const yawRad = (yawDeg * Math.PI) / 180;
  inletSpeed = normalized * Math.cos(yawRad);
  yawVelocity = normalized * Math.sin(yawRad);
  const inlet = { u: new Float32Array(NY), v: new Float32Array(NY) };
  for (let y = 0; y < NY; y += 1) {
    // Mild boundary layer at the floor (y near NY-1).
    const distanceFromFloor = (NY - 1 - y) / (NY - 1);
    const boundaryLayer = Math.min(1, 0.6 + distanceFromFloor * 0.5);
    const rakeDistance = Math.abs(y / (NY - 1) - windSourceY);
    const rakeBoost = 1 + 0.28 * Math.exp(-(rakeDistance * rakeDistance) / 0.0018);
    inlet.u[y] = inletSpeed * boundaryLayer * rakeBoost;
    inlet.v[y] = yawVelocity * boundaryLayer * rakeBoost;
  }
  return inlet;
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === "init") {
    mask = normalizeMask(data.mask);
    u.fill(0);
    v.fill(0);
    p.fill(0);
    inletSpeed = (data.airspeed ?? 80) / 60;
    self.postMessage({ type: "ready", nx: NX, ny: NY });
    return;
  }

  if (data.type === "set-mask") {
    mask = normalizeMask(data.mask);
    u.fill(0);
    v.fill(0);
    p.fill(0);
    return;
  }

  if (data.type === "tick") {
    if (data.mask) {
      mask = normalizeMask(data.mask);
    }
    groundMode = data.groundMode === "fixed" ? "fixed" : "rolling";
    wheelMode = data.wheelMode === "stationary" ? "stationary" : "rotating";
    const profile = buildInletProfile(data.airspeed ?? 80, data.yawDeg ?? 0, clamp01(data.windSourceY ?? 0.48));
    const ticks = data.subSteps ?? 1;
    for (let i = 0; i < ticks; i += 1) step(profile);
    const forces = computeForces();
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
    });
  }
});

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.48));
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
