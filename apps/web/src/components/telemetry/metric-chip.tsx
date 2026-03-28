interface MetricChipProps {
  label: string;
  value: string;
}

export function MetricChip({ label, value }: MetricChipProps) {
  return (
    <div className="metric-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
