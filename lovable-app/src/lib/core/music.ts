import { z } from "zod";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const TUNING_LOW_TO_HIGH = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
export const MAX_FRET = 22;
/** One note per string: a chord cannot exceed the guitar's six strings. */
export const MAX_CHORD_NOTES = TUNING_LOW_TO_HIGH.length;
const TEMPLATES: Record<string, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10], sus4: [0, 5, 7], sus2: [0, 2, 7],
};
const SUFFIX: Record<string, string> = { maj: "", min: "m" };

export const MusicRequest = z
  .object({
    action: z.enum(["identify_chord", "transpose", "tab"]),
    notes: z.array(z.number().int().min(0).max(127)).min(1).max(12),
    semitones: z.number().int().min(-24).max(24).default(0),
  })
  .strict();
export type MusicRequest = z.infer<typeof MusicRequest>;

const mod = (a: number, n: number) => ((a % n) + n) % n;
export const noteName = (midi: number) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

const setEq = (a: Set<number>, b: number[]) => a.size === b.length && b.every((x) => a.has(x));

export function identifyChord(notes: number[]): string | null {
  if (!notes.length) return null;
  const pcs = new Set(notes.map((n) => n % 12));
  const bass = Math.min(...notes) % 12;
  const found: [number, number, string][] = [];
  const order = Object.keys(TEMPLATES);
  for (let root = 0; root < 12; root++) {
    const rel = new Set([...pcs].map((p) => mod(p - root, 12)));
    for (const q of order) {
      const tpl = TEMPLATES[q];
      if (tpl && setEq(rel, tpl)) found.push([root === bass ? 0 : 1, root, q]);
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
  const best = found[0];
  if (!best) return null;
  const [, root, quality] = best;
  return (NOTE_NAMES[root] ?? "") + (SUFFIX[quality] ?? quality);
}

export function transpose(notes: number[], semitones: number): number[] {
  const out = notes.map((n) => n + semitones);
  if (out.some((n) => n < 0 || n > 127)) throw new Error("transposição leva nota para fora de 0-127");
  return out;
}

/**
 * Places the notes of a chord on distinct strings.
 *
 * Each note gets a different string so the result can be played simultaneously.
 * Among the possible positions it picks the one with the smallest stretch between
 * frets (and, on ties, the smallest sum of frets), which avoids impossible
 * stretches. The input note order is preserved in the output.
 */
export function toGuitarTab(notes: number[]): { note: string; string: number; fret: number }[] {
  if (notes.length > MAX_CHORD_NOTES) {
    throw new Error(`acorde com ${notes.length} notas excede as ${MAX_CHORD_NOTES} cordas do violão`);
  }
  const options: [number, number][][] = notes.map((n) => {
    const choices = TUNING_LOW_TO_HIGH.map((open, idx) => [idx, n - open] as [number, number]).filter(([, f]) => f >= 0 && f <= MAX_FRET);
    if (!choices.length) throw new Error(`nota ${n} fora do alcance do violão`);
    return choices.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  });

  const best: { pick: [number, number][] | null; cost: [number, number, number[]] | null } = { pick: null, cost: null };
  const current: [number, number][] = [];
  const used = new Set<number>();
  const costIsLess = (a: [number, number, number[]], b: [number, number, number[]]) => {
    if (a[0] !== b[0]) return a[0] < b[0];
    if (a[1] !== b[1]) return a[1] < b[1];
    for (let i = 0; i < Math.min(a[2].length, b[2].length); i++) {
      if (a[2][i] !== b[2][i]) return (a[2][i] ?? 0) < (b[2][i] ?? 0);
    }
    return a[2].length < b[2].length;
  };
  const search = (position: number) => {
    if (position === notes.length) {
      const frets = current.map(([, f]) => f);
      const cost: [number, number, number[]] = [Math.max(...frets) - Math.min(...frets), frets.reduce((a, b) => a + b, 0), [...frets]];
      if (best.cost === null || costIsLess(cost, best.cost)) {
        best.cost = cost;
        best.pick = [...current];
      }
      return;
    }
    for (const [idx, fret] of options[position] ?? []) {
      if (used.has(idx)) continue;
      used.add(idx);
      current.push([idx, fret]);
      search(position + 1);
      current.pop();
      used.delete(idx);
    }
  };
  search(0);

  const pick = best.pick;
  if (!pick) throw new Error(`não foi possível posicionar o acorde em cordas distintas: ${notes}`);
  return notes.map((n, i) => ({ note: noteName(n), string: 6 - (pick[i]?.[0] ?? 0), fret: pick[i]?.[1] ?? 0 }));
}

export function checkMusicRequest(req: MusicRequest): string[] {
  const reasons: string[] = [];
  if (req.action === "transpose") {
    for (const n of req.notes) {
      if (n + req.semitones < 0 || n + req.semitones > 127) {
        reasons.push(`nota ${n} transposta em ${req.semitones} sai do intervalo 0-127`);
        break;
      }
    }
  }
  if (req.action === "tab") {
    // The contract allows up to 12 notes for every action, but a chord only fits on the
    // guitar's strings. Reject it in the gate (fail closed, before the tool) instead of
    // relying on the throw inside toGuitarTab.
    if (req.notes.length > MAX_CHORD_NOTES) {
      reasons.push(`acorde com ${req.notes.length} notas excede as ${MAX_CHORD_NOTES} cordas do violão`);
    }
    const low = Math.min(...TUNING_LOW_TO_HIGH);
    const high = Math.max(...TUNING_LOW_TO_HIGH) + MAX_FRET;
    const bad = req.notes.filter((n) => n < low || n > high);
    if (bad.length) reasons.push(`notas fora do alcance do violão (${low}-${high}): [${bad.join(", ")}]`);
  }
  return reasons;
}

export const MUSIC_TOOL_BY_ACTION = { identify_chord: "identify_chord", transpose: "transpose_notes", tab: "to_guitar_tab" } as const;
