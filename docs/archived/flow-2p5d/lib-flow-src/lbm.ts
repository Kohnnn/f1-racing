import { computeRelativeMetrics, indexAt, type FlowMaskData, type FlowMetrics } from "./field";

const Q = 9;

const EX = [0, 1, -1, 0, 0, 1, -1, -1, 1] as const;
const EY = [0, 0, 0, -1, 1, -1, -1, 1, 1] as const;
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36] as const;
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6] as const;

const TAU = 0.56;
const OMEGA = 1 / TAU;

function cMax(a: number, b: number) {
  return Math.max(a, b);
}

export interface FlowSnapshot {
  width: number;
  height: number;
  obstacle: Uint8Array;
  velocityX: Float32Array;
  velocityY: Float32Array;
  speed: Float32Array;
  wake: Float32Array;
  metrics: FlowMetrics;
  inflowVelocity: number;
}

export class ProjectedFlowSolver {
  private readonly w: number;
  private readonly h: number;
  private readonly n: number;
  private readonly maskData: FlowMaskData;
  private f: Float32Array;
  private fout: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private speed: Float32Array;
  private wake: Float32Array;
  private metrics: FlowMetrics;
  private u0: number;
  private initialized: boolean;

  constructor(maskData: FlowMaskData, u0 = 0.06) {
    this.w = maskData.width;
    this.h = maskData.height;
    this.n = this.w * this.h;
    this.maskData = maskData;
    this.u0 = u0;
    this.f = new Float32Array(this.n * Q);
    this.fout = new Float32Array(this.n * Q);
    this.vx = new Float32Array(this.n);
    this.vy = new Float32Array(this.n);
    this.speed = new Float32Array(this.n);
    this.wake = new Float32Array(this.n);
    this.metrics = { wakeWidth: 0, wakeLength: 0, wakeArea: 0, dragProxy: 0 };
    this.initialized = false;
    this.initialize();
  }

  reset(u0: number) {
    this.u0 = u0;
    this.initialize();
  }

  getSnapshot(): FlowSnapshot {
    return {
      width: this.w,
      height: this.h,
      obstacle: this.maskData.obstacle,
      velocityX: this.vx,
      velocityY: this.vy,
      speed: this.speed,
      wake: this.wake,
      metrics: this.metrics,
      inflowVelocity: this.u0,
    };
  }

  warmup(iters = 180) {
    for (let i = 0; i < iters; i += 1) {
      this.step();
    }
  }

  step(iterations = 1) {
    for (let i = 0; i < iterations; i += 1) {
      this.iterate();
    }
    this.computeVelocities();
    this.computeWake();
    this.metrics = computeRelativeMetrics(this.maskData, this.vx, this.u0);
  }

  sampleVelocity(x: number, y: number) {
    const xi = Math.max(0, Math.min(this.w - 1, Math.floor(x)));
    const yi = Math.max(0, Math.min(this.h - 1, Math.floor(y)));
    return { x: this.vx[indexAt(xi, yi, this.w)], y: this.vy[indexAt(xi, yi, this.w)] };
  }

  private initialize() {
    for (let i = 0; i < this.n * Q; i += 1) {
      this.f[i] = 0;
    }

    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        const idx = indexAt(x, y, this.w);
        if (this.maskData.obstacle[idx]) {
          continue;
        }

        const fBase = idx * Q;
        for (let dir = 0; dir < Q; dir += 1) {
          this.f[fBase + dir] = this.equilibrium(this.u0, 0, dir);
        }
      }
    }

    this.computeVelocities();
    this.computeWake();
    this.metrics = computeRelativeMetrics(this.maskData, this.vx, this.u0);
    this.initialized = true;
  }

  private equilibrium(u: number, v: number, dir: number): number {
    const u2 = u * u + v * v;
    const dot = EX[dir] * u + EY[dir] * v;
    return W[dir] * (1 + 3 * dot + 4.5 * dot * dot - 1.5 * u2);
  }

  private iterate() {
    for (let y = 1; y < this.h - 1; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        const idx = indexAt(x, y, this.w);
        if (this.maskData.obstacle[idx]) {
          continue;
        }

        let rho = 0;
        const fIn = idx * Q;
        for (let dir = 0; dir < Q; dir += 1) {
          rho += this.f[fIn + dir];
        }

        let u = 0;
        let v = 0;
        if (x <= 1 && rho > 0.0001) {
          rho = 1;
          u = this.u0;
          v = 0;
        } else if (rho > 0.0001) {
          u = (this.f[fIn + 1] + this.f[fIn + 5] + this.f[fIn + 8] - this.f[fIn + 3] - this.f[fIn + 6] - this.f[fIn + 7]) / rho;
          v = (this.f[fIn + 4] + this.f[fIn + 7] + this.f[fIn + 8] - this.f[fIn + 2] - this.f[fIn + 5] - this.f[fIn + 6]) / rho;
        }

        u = Math.max(-0.15, Math.min(0.22, u));
        v = Math.max(-0.1, Math.min(0.1, v));

        const fOut = idx * Q;
        for (let dir = 0; dir < Q; dir += 1) {
          const eq = this.equilibrium(u, v, dir);
          this.fout[fOut + dir] = this.f[fIn + dir] + OMEGA * (eq - this.f[fIn + dir]);
        }
      }
    }

    for (let y = 1; y < this.h - 1; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        const idx = indexAt(x, y, this.w);
        if (this.maskData.obstacle[idx]) {
          continue;
        }

        const fOut = idx * Q;
        for (let dir = 0; dir < Q; dir += 1) {
          const xn = x + EX[dir];
          const yn = y + EY[dir];

          if (xn < 0 || xn >= this.w || yn < 0 || yn >= this.h) {
            const opp = OPP[dir];
            const fBack = idx * Q + opp;
            const sourceIdx = indexAt(x + EX[opp], y + EY[opp], this.w);
            if (this.maskData.obstacle[sourceIdx]) {
              this.f[fBack] = this.fout[fOut + dir];
            } else {
              const backIdx = sourceIdx * Q + opp;
              this.f[backIdx] = this.fout[fOut + dir];
            }
            continue;
          }

          const nIdx = indexAt(xn, yn, this.w);
          if (this.maskData.obstacle[nIdx]) {
            const opp = OPP[dir];
            const backIdx = idx * Q + opp;
            this.f[backIdx] = this.fout[fOut + dir];
            continue;
          }

          const nOffset = nIdx * Q + dir;
          this.f[nOffset] = this.fout[fOut + dir];
        }
      }
    }
  }

  private computeVelocities() {
    for (let y = 1; y < this.h - 1; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        const idx = indexAt(x, y, this.w);
        if (this.maskData.obstacle[idx]) {
          this.vx[idx] = 0;
          this.vy[idx] = 0;
          this.speed[idx] = 0;
          continue;
        }

        let rho = 0;
        const fIn = idx * Q;
        for (let dir = 0; dir < Q; dir += 1) {
          rho += this.f[fIn + dir];
        }

        let u = 0;
        let v = 0;
        if (x <= 1 && rho > 0.0001) {
          u = this.u0;
          v = 0;
        } else if (rho > 0.0001) {
          u = (this.f[fIn + 1] + this.f[fIn + 5] + this.f[fIn + 8] - this.f[fIn + 3] - this.f[fIn + 6] - this.f[fIn + 7]) / rho;
          v = (this.f[fIn + 4] + this.f[fIn + 7] + this.f[fIn + 8] - this.f[fIn + 2] - this.f[fIn + 5] - this.f[fIn + 6]) / rho;
        }

        this.vx[idx] = u;
        this.vy[idx] = v;
        this.speed[idx] = Math.hypot(u, v);
      }
    }
  }

  private computeWake() {
    for (let y = 1; y < this.h - 1; y += 1) {
      for (let x = 1; x < this.w; x += 1) {
        const idx = indexAt(x, y, this.w);
        if (this.maskData.obstacle[idx]) {
          this.wake[idx] = 0;
          continue;
        }

        if (x > this.maskData.bounds.maxX) {
          const deficit = Math.max(0, this.u0 - this.vx[idx]) / cMax(this.u0, 0.0001);
          this.wake[idx] = Math.min(1, deficit * 1.8);
        } else {
          this.wake[idx] = 0;
        }
      }
    }
  }
}