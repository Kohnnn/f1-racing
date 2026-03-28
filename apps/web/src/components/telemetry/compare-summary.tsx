import { formatDeltaMs } from "@f1-racing/telemetry-utils";
import type { ComparePack } from "@/lib/data";

interface CompareSummaryProps {
  compare: ComparePack;
}

export function CompareSummary({ compare }: CompareSummaryProps) {
  return (
    <div className="panel compare-summary">
      <div className="section-header">
        <div>
          <p className="eyebrow">Driver compare</p>
          <h2>
            {compare.drivers[0]} vs {compare.drivers[1]}
          </h2>
        </div>
      </div>
      <div className="compare-summary__grid">
        <div>
          <h3>Delta sections</h3>
          <ul className="summary-list">
            {compare.deltaSections.map((section, index) => (
              <li key={`${section.leader}-${index}`}>
                <strong>{section.leader}</strong>
                <span>
                  {Math.round(section.from * 100)}% {"->"} {Math.round(section.to * 100)}% · {formatDeltaMs(section.deltaMs)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Derived events</h3>
          <ul className="summary-list">
            {compare.events.map((event, index) => (
              <li key={`${event.driver}-${index}`}>
                <strong>{event.driver}</strong>
                <span>
                  {event.type.replace(/_/g, " ")} at {String(event.corner)}
                  {event.note ? ` - ${event.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
