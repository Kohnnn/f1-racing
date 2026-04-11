"use client";

import { useMemo, useState } from "react";
import { formatLapTime } from "@f1-racing/telemetry-utils";
import type { LapRecord } from "@/lib/data";

const PAGE_SIZE = 120;

interface LapTableProps {
  laps: LapRecord[];
}

export function LapTable({ laps }: LapTableProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleLaps = useMemo(() => laps.slice(0, visibleCount), [laps, visibleCount]);

  return (
    <div className="panel table-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Session sample</p>
          <h2>Representative lap records</h2>
          <p>
            Showing {Math.min(visibleLaps.length, laps.length)} of {laps.length} recorded laps so the browser can open
            the session quickly and expand on demand.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Driver</th>
              <th>Lap</th>
              <th>Lap time</th>
              <th>S1</th>
              <th>S2</th>
              <th>S3</th>
              <th>Compound</th>
              <th>Stint</th>
            </tr>
          </thead>
          <tbody>
            {visibleLaps.map((lap) => (
              <tr key={`${lap.driverCode}-${lap.lapNumber}`}>
                <td>
                  {lap.driverCode}
                  {lap.isFastest ? <span className="fastest-pill">Fastest</span> : null}
                </td>
                <td>{lap.lapNumber}</td>
                <td>{formatLapTime(lap.lapTime)}</td>
                <td>{formatLapTime(lap.sector1)}</td>
                <td>{formatLapTime(lap.sector2)}</td>
                <td>{formatLapTime(lap.sector3)}</td>
                <td>{lap.compound}</td>
                <td>{lap.stint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibleCount < laps.length ? (
        <div className="hero-actions">
          <button className="button button--secondary" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, laps.length - visibleCount)} more laps
          </button>
          <button className="button button--ghost" type="button" onClick={() => setVisibleCount(laps.length)}>
            Show all laps
          </button>
        </div>
      ) : null}
    </div>
  );
}
