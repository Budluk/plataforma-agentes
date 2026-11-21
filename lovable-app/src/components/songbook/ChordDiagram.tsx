import { cn } from "@/lib/utils";
import type { ChordShape } from "@/lib/core/musicCatalog";

const STRING_X = [12, 22, 32, 42, 52, 62] as const;
const TOP = 16;
const ROW = 13;
const ROWS = 4;

/** A compact, ink-on-paper guitar chord diagram in the songbook's visual language. */
export function ChordDiagram({
  name,
  shape,
  className,
}: {
  name: string;
  shape: ChordShape;
  className?: string;
}) {
  const active = shape.frets.filter((fret): fret is number => fret !== null && fret > 0);
  const highest = active.length ? Math.max(...active) : 0;
  const lowest = active.length ? Math.min(...active) : 1;
  const start = highest <= 4 ? 1 : lowest;
  const showNut = start === 1;
  const bottom = TOP + ROWS * ROW;
  const yFor = (fret: number) => TOP + (fret - start + 0.5) * ROW;

  return (
    <svg
      viewBox="0 0 74 84"
      className={cn("block h-auto w-full", className)}
      role="img"
      aria-label={`Diagrama do acorde ${name}`}
    >
      {Array.from({ length: ROWS + 1 }, (_, i) => {
        const y = TOP + i * ROW;
        const isNut = showNut && i === 0;
        return (
          <line
            key={`fret-${i}`}
            x1={STRING_X[0]}
            x2={STRING_X[5]}
            y1={y}
            y2={y}
            stroke={isNut ? "#12233b" : "#c2cad4"}
            strokeWidth={isNut ? 3 : 1}
          />
        );
      })}

      {STRING_X.map((x, i) => (
        <line
          key={`string-${i}`}
          x1={x}
          x2={x}
          y1={TOP}
          y2={bottom}
          stroke="#94a1b1"
          strokeWidth={1 + i * 0.12}
        />
      ))}

      {shape.frets.map((fret, i) => {
        const x = STRING_X[i];
        if (fret === null) {
          return (
            <text key={`mark-${i}`} x={x} y={8} textAnchor="middle" fontSize="9" fill="#8a97a8">
              ×
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle
              key={`mark-${i}`}
              cx={x}
              cy={8}
              r={2.6}
              fill="none"
              stroke="#66748a"
              strokeWidth="1.2"
            />
          );
        }
        return null;
      })}

      {shape.barre && shape.barre.fret >= start && shape.barre.fret <= start + ROWS - 1 && (
        <rect
          x={STRING_X[shape.barre.from]! - 5}
          y={yFor(shape.barre.fret) - 4.5}
          width={STRING_X[shape.barre.to]! - STRING_X[shape.barre.from]! + 10}
          height="9"
          rx="4.5"
          fill="#12233b"
        />
      )}

      {shape.frets.map((fret, i) => {
        if (fret === null || fret === 0 || fret < start || fret > start + ROWS - 1) return null;
        if (
          shape.barre &&
          fret === shape.barre.fret &&
          i >= shape.barre.from &&
          i <= shape.barre.to
        ) {
          return null;
        }
        return <circle key={`dot-${i}`} cx={STRING_X[i]} cy={yFor(fret)} r={4.6} fill="#12233b" />;
      })}

      {!showNut && (
        <text x={2} y={TOP + ROW - 1} fontSize="8" fill="#66748a">
          {start}fr
        </text>
      )}
    </svg>
  );
}
