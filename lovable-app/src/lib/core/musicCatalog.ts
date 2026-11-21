/**
 * Songbook catalog and guitar helpers for the music surface.
 *
 * The catalog is illustrative: song titles and artist names are real, but the
 * chord charts and text lines are original demo content — not transcriptions
 * of any recording. Pure data and pure functions only; no I/O here.
 */

export type ChordShape = {
  /** Low E -> high e. null = muted string, 0 = open string. */
  frets: readonly (number | null)[];
  barre?: { fret: number; from: number; to: number };
};

export type LyricSegment = { chord: string; text: string };
export type LyricLine = readonly LyricSegment[];

export type DemoSong = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  key: string;
  level: "Fácil" | "Média";
  chords: readonly string[];
  lyrics: readonly LyricLine[];
};

export const GENRES = [
  "Todos",
  "Rock",
  "Sertanejo",
  "Gospel/Religioso",
  "MPB",
  "Pop",
] as const;

/** Open-position shapes. Transposition moves the whole shape up/down the neck. */
export const CHORD_SHAPES: Readonly<Record<string, ChordShape>> = {
  C: { frets: [null, 3, 2, 0, 1, 0] },
  G: { frets: [3, 2, 0, 0, 0, 3] },
  Am: { frets: [null, 0, 2, 2, 1, 0] },
  F: { frets: [1, 3, 3, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  D: { frets: [null, null, 0, 2, 3, 2] },
  Em: { frets: [0, 2, 2, 0, 0, 0] },
  E: { frets: [0, 2, 2, 1, 0, 0] },
  A: { frets: [null, 0, 2, 2, 2, 0] },
  Dm: { frets: [null, null, 0, 2, 3, 1] },
  Bm: { frets: [null, 2, 4, 4, 3, 2], barre: { fret: 2, from: 1, to: 5 } },
};

export const DEMO_SONGS: readonly DemoSong[] = [
  {
    id: "velha-infancia",
    title: "Velha Infância",
    artist: "Tribalistas",
    genre: "MPB",
    key: "C",
    level: "Média",
    chords: ["C", "G", "Am", "F"],
    lyrics: [
      [{ chord: "C", text: "Hoje o dia começa" }, { chord: "G", text: "devagar" }],
      [{ chord: "Am", text: "E a memória volta" }, { chord: "F", text: "sem avisar" }],
      [{ chord: "C", text: "Tem um cheiro antigo" }, { chord: "G", text: "no lugar" }],
      [{ chord: "Am", text: "E um som que a gente" }, { chord: "F", text: "sabe cantar" }],
    ],
  },
  {
    id: "boate-azul",
    title: "Boate Azul",
    artist: "Bruno & Marrone",
    genre: "Sertanejo",
    key: "G",
    level: "Fácil",
    chords: ["G", "D", "Am", "C"],
    lyrics: [
      [{ chord: "G", text: "Na pista vazia" }, { chord: "D", text: "a noite ficou" }],
      [{ chord: "Am", text: "Um rastro de luz" }, { chord: "C", text: "se desfez" }],
      [{ chord: "G", text: "E o tempo passa" }, { chord: "D", text: "devagar" }],
      [{ chord: "Am", text: "Sem pressa de ir" }, { chord: "C", text: "além" }],
    ],
  },
  {
    id: "samurai",
    title: "Samurai",
    artist: "Djavan",
    genre: "MPB",
    key: "Am",
    level: "Média",
    chords: ["Am", "Dm", "G", "C"],
    lyrics: [
      [{ chord: "Am", text: "Caminho estreito" }, { chord: "Dm", text: "na cidade" }],
      [{ chord: "G", text: "Cada passo é um" }, { chord: "C", text: "verso só" }],
      [{ chord: "Am", text: "E a espada é o" }, { chord: "Dm", text: "pensamento" }],
      [{ chord: "G", text: "Que corta o ruído" }, { chord: "C", text: "e diz não" }],
    ],
  },
  {
    id: "porque-ele-vive",
    title: "Porque Ele Vive",
    artist: "Harpa Cristã",
    genre: "Gospel/Religioso",
    key: "E",
    level: "Fácil",
    chords: ["E", "A", "Bm", "E"],
    lyrics: [
      [{ chord: "E", text: "Quando o céu fecha" }, { chord: "A", text: "e o chão some" }],
      [{ chord: "Bm", text: "Ainda há um canto" }, { chord: "E", text: "que permanece" }],
      [{ chord: "E", text: "Não é só o vento" }, { chord: "A", text: "que me leva" }],
      [{ chord: "Bm", text: "É uma esperança" }, { chord: "E", text: "que não se esvai" }],
    ],
  },
  {
    id: "e-tudo-sobre-voce",
    title: "É Tudo Sobre Você",
    artist: "MORADA",
    genre: "Gospel/Religioso",
    key: "G",
    level: "Fácil",
    chords: ["G", "D", "Em", "C"],
    lyrics: [
      [{ chord: "G", text: "Tudo o que eu sou" }, { chord: "D", text: "cabe aqui" }],
      [{ chord: "Em", text: "Num gesto simples" }, { chord: "C", text: "que me faz ficar" }],
      [{ chord: "G", text: "Não preciso de mais" }, { chord: "D", text: "que esse olhar" }],
      [{ chord: "Em", text: "Que acende o mundo" }, { chord: "C", text: "e faz cantar" }],
    ],
  },
  {
    id: "irmao-da-lua",
    title: "Irmão da Lua, Amigo das Estrelas",
    artist: "Zezé Di Camargo & Luciano",
    genre: "Sertanejo",
    key: "A",
    level: "Média",
    chords: ["A", "E", "D", "A"],
    lyrics: [
      [{ chord: "A", text: "Irmão da lua, companheiro" }, { chord: "E", text: "do vento" }],
      [{ chord: "D", text: "Me empresta um pouco" }, { chord: "A", text: "do seu luar" }],
      [{ chord: "A", text: "Que a estrada é longa" }, { chord: "E", text: "e o tempo é pouco" }],
      [{ chord: "D", text: "Mas ainda dá tempo" }, { chord: "A", text: "de sonhar" }],
    ],
  },
  {
    id: "sublime",
    title: "Sublime",
    artist: "Florianópolis House Of Prayer",
    genre: "Gospel/Religioso",
    key: "C",
    level: "Fácil",
    chords: ["C", "G", "Am", "F"],
    lyrics: [
      [{ chord: "C", text: "Sublime é o instante" }, { chord: "G", text: "que não se repete" }],
      [{ chord: "Am", text: "Um fio de luz" }, { chord: "F", text: "na manhã" }],
      [{ chord: "C", text: "E tudo se calma" }, { chord: "G", text: "quando se sente" }],
      [{ chord: "Am", text: "Que o tempo inteiro" }, { chord: "F", text: "é só aqui" }],
    ],
  },
  {
    id: "bondade-de-deus",
    title: "Bondade de Deus",
    artist: "Isaías Saad",
    genre: "Gospel/Religioso",
    key: "D",
    level: "Média",
    chords: ["D", "A", "Bm", "G"],
    lyrics: [
      [{ chord: "D", text: "Bondade que alcança" }, { chord: "A", text: "o meu caminho" }],
      [{ chord: "Bm", text: "Renova a esperança" }, { chord: "G", text: "no meu viver" }],
      [{ chord: "D", text: "Nem o peso da noite" }, { chord: "A", text: "apaga o caminho" }],
      [{ chord: "Bm", text: "Quem cuida de mim" }, { chord: "G", text: "não sabe esquecer" }],
    ],
  },
  {
    id: "tempo-perdido",
    title: "Tempo Perdido",
    artist: "Legião Urbana",
    genre: "Rock",
    key: "E",
    level: "Média",
    chords: ["E", "C", "D", "G"],
    lyrics: [
      [{ chord: "E", text: "Por vezes o dia" }, { chord: "C", text: "não colabora" }],
      [{ chord: "D", text: "Mas dá pra cantar" }, { chord: "G", text: "mesmo assim" }],
      [{ chord: "E", text: "O tempo perdido" }, { chord: "C", text: "volta em canção" }],
      [{ chord: "D", text: "E encontra lugar" }, { chord: "G", text: "no meu coração" }],
    ],
  },
  {
    id: "vem-morar-comigo",
    title: "Vem Morar Comigo",
    artist: "Restart",
    genre: "Pop",
    key: "C",
    level: "Fácil",
    chords: ["C", "G", "Am", "F"],
    lyrics: [
      [{ chord: "C", text: "Vem comigo pra onde" }, { chord: "G", text: "o dia não chega" }],
      [{ chord: "Am", text: "Onde o relógio" }, { chord: "F", text: "não quer dizer" }],
      [{ chord: "C", text: "A hora, o dia, o mês" }, { chord: "G", text: "ou o que vier" }],
      [{ chord: "Am", text: "Só o som da gente" }, { chord: "F", text: "a se reconhecer" }],
    ],
  },
];

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Transposes a chord symbol, preserving its quality suffix and accidental spelling. */
export function transposeChord(chord: string, semitones: number): string {
  const match = /^([A-G])([#b]?)(.*)$/.exec(chord.trim());
  if (!match) return chord;
  const [, letter, accidental, suffix = ""] = match;
  const natural = NATURAL[letter ?? "C"] ?? 0;
  const base = natural + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  const target = (((base + semitones) % 12) + 12) % 12;
  const names = accidental === "b" ? FLAT_NAMES : SHARP_NAMES;
  return (names[target] ?? SHARP_NAMES[target] ?? "C") + suffix;
}

/** Moves a fingering along the neck; pitches an octave off wrap to a valid fret. */
export function shiftShape(shape: ChordShape, semitones: number): ChordShape {
  const shift = (fret: number) => {
    const next = fret + semitones;
    return next < 0 ? next + 12 : next > 12 ? next - 12 : next;
  };
  const moved: ChordShape = {
    frets: shape.frets.map((fret) => (fret === null ? null : shift(fret))),
  };
  if (shape.barre) moved.barre = { ...shape.barre, fret: shift(shape.barre.fret) };
  return moved;
}

export const shapeFor = (chord: string, semitones: number): ChordShape =>
  shiftShape(CHORD_SHAPES[chord] ?? CHORD_SHAPES["C"]!, semitones);

export const artistsFor = (songs: readonly DemoSong[]): string[] =>
  [...new Set(songs.map((song) => song.artist))].sort((a, b) => a.localeCompare(b, "pt-BR"));
