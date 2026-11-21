import { describe, it, expect } from "vitest";
import {
  CHORD_SHAPES,
  DEMO_SONGS,
  artistsFor,
  shiftShape,
  transposeChord,
} from "@/lib/core/musicCatalog";

describe("transposeChord", () => {
  it("transposes roots and keeps the quality suffix", () => {
    expect(transposeChord("C", 2)).toBe("D");
    expect(transposeChord("Am", 2)).toBe("Bm");
    expect(transposeChord("F", -1)).toBe("E");
    expect(transposeChord("G7", 5)).toBe("C7");
  });

  it("preserves the accidental spelling chosen by the source chord", () => {
    expect(transposeChord("Bb", 2)).toBe("C");
    expect(transposeChord("F#m", 2)).toBe("G#m");
    expect(transposeChord("Db", -2)).toBe("B");
  });

  it("wraps a full octave and ignores unparseable symbols", () => {
    expect(transposeChord("C", 12)).toBe("C");
    expect(transposeChord("C", -12)).toBe("C");
    expect(transposeChord("nada", 3)).toBe("nada");
  });
});

describe("shiftShape", () => {
  it("mutes stay muted and frets move along the neck", () => {
    expect(shiftShape(CHORD_SHAPES["C"]!, 2).frets).toEqual([null, 5, 4, 2, 3, 2]);
  });

  it("moves the barre with the fretted notes", () => {
    expect(shiftShape(CHORD_SHAPES["F"]!, 2).barre).toEqual({ fret: 3, from: 0, to: 5 });
  });

  it("wraps negative positions into a playable fret", () => {
    expect(shiftShape(CHORD_SHAPES["C"]!, -3).frets).toEqual([null, 0, 11, 9, 10, 9]);
  });
});

describe("demo catalog", () => {
  it("has a shape for every chord referenced by a song", () => {
    for (const song of DEMO_SONGS) {
      for (const chord of song.chords) expect(CHORD_SHAPES[chord], `${song.id}: ${chord}`).toBeDefined();
      for (const line of song.lyrics) {
        for (const segment of line) expect(song.chords).toContain(segment.chord);
      }
    }
  });

  it("uses the same key as the first chord's root", () => {
    for (const song of DEMO_SONGS) expect(song.chords[0], song.id).toBe(song.key);
  });

  it("lists artists once, sorted", () => {
    const artists = artistsFor(DEMO_SONGS);
    expect(artists).toEqual([...new Set(artists)]);
    expect(artists).toEqual([...artists].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });
});
