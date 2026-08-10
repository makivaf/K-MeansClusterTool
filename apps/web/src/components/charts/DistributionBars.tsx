type DistributionBarsProps = {
  values: Record<string, number>;
};

const colors = ["#0f7977", "#d88a00", "#7d5fb2", "#5d8aa8"];

export const DistributionBars = ({ values }: DistributionBarsProps) => {
  const entries = Object.entries(values);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-sm bg-slate-100">
        {entries.map(([label, value], index) => (
          <div
            key={label}
            title={`${label}: ${value}`}
            style={{ width: `${(value / total) * 100}%`, backgroundColor: colors[index % colors.length] }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {entries.map(([label, value], index) => (
          <span key={label} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
            {label}: {value}
          </span>
        ))}
      </div>
    </div>
  );
};
