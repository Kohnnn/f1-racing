/**
 * Stable-Fluids Web Worker.
 *
 * 2D incompressible Navier-Stokes solver based on Jos Stam's "Stable Fluids"
 * (1999) approach: semi-Lagrangian advection + Jacobi pressure projection.
 * The solver runs in a Worker so the main UI stays responsive while it
 * iterates at ~30-60 Hz.
 *
 * Wire protocol (postMessage):
 *
 *   IN  { type: "init", width, height, mask, uin, density }
 *   IN  { type: "tick", uin, dtMs, mask, drsOpen }
 *   IN  { type: "set-resolution", width, height }
 *   OUT { type: "frame", u: Float32Array, v: Float32Array, p: Float32Array,
 *         speed: Float32Array, density: Float32Array, drag, lift }
 *
 * The simulation is intentionally illustrative -- the physics constants are
 * tuned for visual clarity, not accuracy. The wind tunnel UI labels it as
 * such.
 */

const NX = 320; // grid columns
const NY = 120; // grid rows
const N = NX * NY;
const DT = 0.045;
const VISCOSITY = 0.00018;
const DENSITY_DIFF = 0.00008;
const PRESSURE_ITER = 18;

const u = new Float32Array(N);
const v = new Float32Array(N);
const u0 = new Float32Array(N);
const v0 = new Float32Array(N);
const dens = new Float32Array(N);
const dens0 = new Float32Array(N);
const p = new Float32Array(N);
const div = new Float32Array(N);
const speed = new Float32Array(N);
let mask = new Uint8Array(N);
let inletSpeed = 1.4;

function idx(x: number, y: number): number {
  return y * NX + x;
}

function setBoundaries(field: Float32Array, isVerticalComponent: boolean): void {
  // Walls: top + bottom slip, left = inlet (Dirichlet), right = outflow.
  for (let y = 0; y < NY; y += 1) {
    field[idx(0, y)] = isVerticalComponent ? 0 : inletSpeed;
    field[idx(NX - 1, y)] = field[idx(NX - 2, y)];
  }
  for (let x = 0; x < NX; x += 1) {
    field[idx(x, 0)] = isVerticalComponent ? 0 : field[idx(x, 1)];
    field[idx(x, NY - 1)] = isVerticalComponent ? 0 : field[idx(x, NY - 2)];
  }

  // No-slip at obstacle cells.
  for (let i = 0; i < N; i += 1) {
    if (mask[i]) {
      field[i] = 0;
    }
  }
}

function diffuse(field: Float32Array, source: Float32Array, rate: number, isVertical: boolean): void {
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

function advect(field: Float32Array, source: Float32Array, fieldU: Float32Array, fieldV: Float32Array, isVertical: boolean): void {
  const dt0x = DT * NX;
  const dt0y = DT * NY;
  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = 1; x < NX - 1; x += 1) {
      const c = idx(x, y);
      if (mask[c]) {
        field[c] = 0;
        continue;
      }
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

function project(): void {
  const h = 1 / NX;
  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = 1; x < NX - 1; x += 1) {
      const c = idx(x, y);
      if (mask[c]) {
        div[c] = 0;
        p[c] = 0;
        continue;
      }
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

function injectInlet(uinAtRow: Float32Array): void {
  // Apply inlet velocity profile at column x=0,1.
  for (let y = 1; y < NY - 1; y += 1) {
    const incoming = uinAtRow[y];
    u[idx(0, y)] = incoming;
    u[idx(1, y)] = incoming * 0.96;
    v[idx(0, y)] = 0;
    v[idx(1, y)] = 0;
  }
}

function injectDensity(): void {
  for (let y = 1; y < NY - 1; y += 1) {
    dens[idx(0, y)] = 1;
    dens[idx(1, y)] = 1;
  }
}

function step(uinAtRow: Float32Array): void {
  injectInlet(uinAtRow);
  injectDensity();

  // Velocity diffuse + project + advect.
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

  // Density (smoke) diffuse + advect.
  dens0.set(dens);
  diffuse(dens, dens0, DENSITY_DIFF, false);
  dens0.set(dens);
  advect(dens, dens0, u, v, false);

  // Update speed magnitude scratch for the renderer.
  for (let i = 0; i < N; i += 1) {
    speed[i] = Math.hypot(u[i], v[i]);
  }
}

function computeForces(): { drag: number; lift: number } {
  // Approximate drag and lift on the obstacle by integrating the pressure
  // difference across mask boundary cells. Not a quantitative Cd/Cl, just an
  // illustrative readout.
  let drag = 0;
  let lift = 0;
  for (let y = 1; y < NY - 1; y += 1) {
    for (let x = 1; x < NX - 1; x += 1) {
      if (!mask[idx(x, y)]) continue;
      // Horizontal pressure delta = drag.
      const left = mask[idx(x - 1, y)] ? 0 : p[idx(x - 1, y)];
      const right = mask[idx(x + 1, y)] ? 0 : p[idx(x + 1, y)];
      drag += left - right;
      // Vertical pressure delta = lift (down-positive).
      const above = mask[idx(x, y - 1)] ? 0 : p[idx(x, y - 1)];
      const below = mask[idx(x, y + 1)] ? 0 : p[idx(x, y + 1)];
      lift += above - below;
    }
  }
  return { drag, lift };
}

function buildInletProfile(speedMps: number): Float32Array {
  inletSpeed = speedMps / 60; // normalize against grid scale
  const out = new Float32Array(NY);
  for (let y = 0; y < NY; y += 1) {
    // Mild boundary layer at the floor (y near NY-1).
    const distanceFromFloor = (NY - 1 - y) / (NY - 1);
    out[y] = inletSpeed * Math.min(1, 0.6 + distanceFromFloor * 0.5);
  }
  return out;
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === "init") {
    mask = data.mask instanceof Uint8Array ? data.mask : new Uint8Array(N);
    u.fill(0);
    v.fill(0);
    dens.fill(0);
    p.fill(0);
    inletSpeed = (data.airspeed ?? 80) / 60;
    (self as unknown as Worker).postMessage({ type: "ready", nx: NX, ny: NY });
    return;
  }

  if (data.type === "set-mask") {
    mask = data.mask instanceof Uint8Array ? data.mask : new Uint8Array(N);
    return;
  }

  if (data.type === "tick") {
    if (data.mask) {
      mask = data.mask instanceof Uint8Array ? data.mask : new Uint8Array(N);
    }
    const profile = buildInletProfile(data.airspeed ?? 80);
    const ticks = data.subSteps ?? 1;
    for (let i = 0; i < ticks; i += 1) {
      step(profile);
    }
    const forces = computeForces();
    (self as unknown as Worker).postMessage(
      {
        type: "frame",
        nx: NX,
        ny: NY,
        speed: speed.slice().buffer,
        density: dens.slice().buffer,
        drag: forces.drag,
        lift: forces.lift,
      },
    );
  }
});
