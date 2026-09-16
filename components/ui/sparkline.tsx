import { cn } from "@/lib/ui/cn";

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Colour by first→last sign when "auto"; otherwise a CSS colour. */
  stroke?: "auto" | string;
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
  /** Draw a faint baseline at this value (e.g. 0 for P&L). */
  baseline?: number;
  title?: string;
}

/** Build an SVG path for a series scaled into a w×h box. Exported for tests. */
export function sparklinePath(data: number[], width: number, height: number, pad = 1): string {
  if (data.length === 0) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  return data
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (height - pad * 2) * (1 - (v - min) / range);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({ data, width = 96, height = 28, stroke = "auto", fill = true, strokeWidth = 1.5, className, baseline, title }: SparklineProps) {
  const path = sparklinePath(data, width, height);
  const first = data[0] ?? 0;
  const last = data[data.length - 1] ?? 0;
  const color = stroke === "auto" ? (last > first ? "var(--positive)" : last < first ? "var(--negative)" : "var(--neutral)") : stroke;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const baselineY = baseline !== undefined && data.length > 0 ? 1 + (height - 2) * (1 - (baseline - min) / range) : null;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block overflow-visible", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {baselineY !== null && baselineY >= 0 && baselineY <= height ? <line x1={0} x2={width} y1={baselineY} y2={baselineY} stroke="var(--edge-strong)" strokeDasharray="2 2" /> : null}
      {fill && path ? <path d={`${path} L${(width - 1).toFixed(2)},${height} L1,${height} Z`} fill={color} opacity={0.12} /> : null}
      {path ? <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" data-testid="sparkline-path" /> : null}
    </svg>
  );
}
