import { formatLapTime } from "@f1-racing/telemetry-utils";
import type { LapRecord } from "@/lib/data";

interface LapTableProps {
  laps: LapRecord[];
}

export function LapTable({ laps }: LapTableProps) {
  return (
    <div className="panel table-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Session sample</p>
          <h2>Representative lap records</h2>
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
            {laps.map((lap) => (
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
    </div>
  );
}
