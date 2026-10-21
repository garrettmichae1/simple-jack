import { useEffect, useId, useRef, useState } from "react";
import "./row-flow.css";

export interface RowFlowProps {
  /** Row indices relative to the currently visible slice, or null if off screen. */
  source: number | null;
  target: number | null;
  rows: number;
  pulseKey: number;
  kind: string;
  reducedMotion: boolean;
  factor: string | null;
}

type Measurements = {
  width: number;
  height: number;
  centers: number[];
  rowHeight: number;
};

/** Decorative operation geometry; the surrounding readout explains the mathematics. */
export function RowFlow({
  source,
  target,
  rows,
  pulseKey,
  kind,
  reducedMotion,
  factor,
}: RowFlowProps) {
  const ref = useRef<SVGSVGElement>(null);
  const motionRef = useRef<SVGAnimateMotionElement>(null);
  const id = `row-flow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [measure, setMeasure] = useState<Measurements>({
    width: 230,
    height: 20 + rows * 51,
    centers: [],
    rowHeight: 51,
  });

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const update = () => {
      const cells = Array.from(
        parent.querySelectorAll<HTMLElement>(":scope > .matrix-cell"),
      );
      const columns = rows > 0 ? Math.floor(cells.length / rows) : 0;
      const styles = getComputedStyle(parent);
      const paddingTop = Number.parseFloat(styles.paddingTop) || 10;
      const paddingBottom = Number.parseFloat(styles.paddingBottom) || 10;
      const rowHeight =
        cells[0]?.offsetHeight ||
        (parent.clientHeight - paddingTop - paddingBottom) / Math.max(rows, 1);
      const centers = Array.from({ length: rows }, (_, i) => {
        const cell = cells[i * columns];
        return cell
          ? cell.offsetTop + cell.offsetHeight / 2
          : paddingTop + (i + 0.5) * rowHeight;
      });
      setMeasure({
        width: parent.clientWidth,
        height: parent.clientHeight,
        centers,
        rowHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [rows, pulseKey]);

  useEffect(() => {
    if (!reducedMotion) motionRef.current?.beginElement();
  }, [pulseKey, source, target, kind, reducedMotion]);

  const valid = (row: number | null): row is number =>
    row !== null && Number.isInteger(row) && row >= 0 && row < rows;
  const hasTarget = valid(target);
  const hasTransfer =
    hasTarget &&
    valid(source) &&
    source !== target &&
    (kind === "eliminate" || kind === "swap");
  const hasSweep = hasTarget && (kind === "pivot" || kind === "scale");
  const y = (row: number) =>
    measure.centers[row] ?? 10 + (row + 0.5) * measure.rowHeight;
  const sourceY = valid(source) ? y(source) : 0;
  const targetY = hasTarget ? y(target) : 0;
  const path = hasTransfer
    ? `M 60 ${sourceY} C 10 ${sourceY}, 10 ${targetY}, 60 ${targetY}`
    : hasSweep
      ? `M 77 ${targetY + measure.rowHeight / 2 - 4} H ${Math.max(80, measure.width + 53)}`
      : "";
  const isSwap = kind === "swap";
  const label = factor && factor.length <= 10 ? `× ${factor}` : "";

  return (
    <svg
      ref={ref}
      className={`row-flow ${reducedMotion ? "row-flow--still" : ""} ${hasSweep ? "row-flow--sweep" : ""}`}
      width={measure.width + 65}
      height={measure.height}
      viewBox={`0 0 ${measure.width + 65} ${Math.max(measure.height, 1)}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-gradient`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c5b782" />
          <stop offset="1" stopColor="#c6f2c7" />
        </linearGradient>
        <filter
          id={`${id}-glow`}
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
        >
          <feGaussianBlur stdDeviation="2.3" />
        </filter>
        <marker
          id={`${id}-arrow`}
          markerWidth="6"
          markerHeight="8"
          refX="5"
          refY="4"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 1 1 L 5 4 L 1 7"
            fill="none"
            stroke="#c5e7b6"
            strokeWidth="1"
          />
        </marker>
      </defs>
      {path && (
        <g
          key={`${pulseKey}-${kind}-${source}-${target}`}
          className="row-flow__operation"
        >
          <path d={path} className="row-flow__guide" />
          <path
            d={path}
            pathLength="1"
            className="row-flow__glow"
            stroke={`url(#${id}-gradient)`}
            filter={`url(#${id}-glow)`}
          />
          <path
            id={`${id}-path`}
            d={path}
            pathLength="1"
            className="row-flow__trace"
            stroke={`url(#${id}-gradient)`}
            markerEnd={hasTransfer ? `url(#${id}-arrow)` : undefined}
            markerStart={
              hasTransfer && isSwap ? `url(#${id}-arrow)` : undefined
            }
          />
          {hasTransfer && (
            <circle cx="60" cy={sourceY} r="2" className="row-flow__origin" />
          )}
          {!reducedMotion && (
            <g className="row-flow__traveler">
              <circle
                r="4.5"
                fill="#c4edb7"
                filter={`url(#${id}-glow)`}
                opacity="0.7"
              />
              <circle r="1.7" fill="#ebf9d3" />
              <animateMotion
                ref={motionRef}
                dur="1.1s"
                begin="indefinite"
                fill="freeze"
                keyPoints="0;1"
                keyTimes="0;1"
                calcMode="spline"
                keySplines="0.22 0.61 0.36 1"
              >
                <mpath href={`#${id}-path`} />
              </animateMotion>
            </g>
          )}
          {hasTransfer && label && (
            <text
              x="8"
              y={(sourceY + targetY) / 2 - 7}
              className="row-flow__factor"
            >
              {label}
            </text>
          )}
          {hasSweep && kind === "scale" && label && (
            <text
              x="55"
              y={targetY + 3}
              textAnchor="end"
              className="row-flow__factor"
            >
              {label}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}

export default RowFlow;
