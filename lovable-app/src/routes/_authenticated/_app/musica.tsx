import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Disc3,
  Guitar,
  Minus,
  Music2,
  Plus,
  RotateCcw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { runMusic } from "@/lib/api/agents.functions";
import { Outcome } from "@/components/console";
import { ChordDiagram } from "@/components/songbook/ChordDiagram";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { pageHead } from "@/lib/core/pageHead";
import {
  CHORD_SHAPES,
  DEMO_SONGS,
  GENRES,
  artistsFor,
  shapeFor,
  transposeChord,
  type ChordShape,
  type DemoSong,
} from "@/lib/core/musicCatalog";

export const Route = createFileRoute("/_authenticated/_app/musica")({
  head: () => pageHead("Cifras — CentralIA", "Songbook, acordes, transposição e tablatura a partir de notas MIDI."),
  component: Musica,
});

const ALL_ARTISTS = artistsFor(DEMO_SONGS);

function Musica() {
  const music = useServerFn(runMusic);
  const [text, setText] = useState("");
  const [action, setAction] = useState<"identify_chord" | "transpose" | "tab">("identify_chord");
  const [notes, setNotes] = useState("60 64 67");
  const [semitones, setSemitones] = useState("2");
  const m = useMutation({ mutationFn: (d: Parameters<typeof music>[0]["data"]) => music({ data: d }) });

  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string>("Todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(["boate-azul", "velha-infancia", "sublime"]);
  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(0);

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = useMemo(
    () =>
      DEMO_SONGS.filter((song) => {
        const matchesGenre = genre === "Todos" || song.genre === genre;
        const haystack = `${song.title} ${song.artist} ${song.genre}`.toLocaleLowerCase("pt-BR");
        return matchesGenre && (!normalizedQuery || haystack.includes(normalizedQuery));
      }),
    [genre, normalizedQuery],
  );
  const selected = selectedId ? DEMO_SONGS.find((song) => song.id === selectedId) ?? null : null;
  const recentSongs = recent
    .map((id) => DEMO_SONGS.find((song) => song.id === id))
    .filter((song): song is DemoSong => Boolean(song));

  const openSong = (id: string) => {
    setSelectedId(id);
    setTranspose(0);
    setCapo(0);
    setRecent((prev) => [id, ...prev.filter((item) => item !== id)].slice(0, 4));
    window.scrollTo({ top: 0 });
  };

  const selectArtist = (artist: string) => {
    setQuery(artist);
    setGenre("Todos");
    setSelectedId(null);
    document.getElementById("songbook-results")?.scrollIntoView();
  };

  const resetSongbook = () => {
    setQuery("");
    setGenre("Todos");
    setSelectedId(null);
  };

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setSelectedId(null);
  };

  const submitForm = () => {
    const ns = notes.split(/[\s,]+/).filter(Boolean).map(Number);
    m.mutate({ request: { action, notes: ns, semitones: action === "transpose" ? Number(semitones) : 0 } });
  };

  return (
    <div className="songbook -mx-5 -mb-8 -mt-8 min-h-[calc(100vh-3rem)] md:-mx-8">
      <header className="songbook-staff bg-[#12233b] text-white">
        <div className="mx-auto max-w-6xl px-5 pb-5 pt-6 md:px-8">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <button
              type="button"
              onClick={resetSongbook}
              aria-label="Voltar ao início do songbook"
              className="group flex items-center gap-2.5"
            >
              <span className="grid size-9 place-items-center rounded-[3px] bg-[#e8663d] font-display text-xl font-bold leading-none text-white shadow-[0_6px_16px_-8px_rgba(232,102,61,0.9)]">
                ♪
              </span>
              <span className="font-display text-[1.6rem] font-bold leading-none tracking-tight">
                cifras<span className="text-[#e8663d]">.</span>
              </span>
            </button>
            <nav aria-label="Seções" className="hidden items-center gap-6 text-sm text-white/65 md:flex">
              <span className="border-b-2 border-[#e8663d] pb-1 font-semibold text-white">Cifras</span>
              <span>Tablaturas</span>
              <span>Artistas</span>
              <span>Acordes</span>
            </nav>
            <div className="ml-auto hidden items-center gap-2 rounded-[3px] border border-white/15 px-2.5 py-1.5 text-[0.625rem] font-medium uppercase tracking-[0.14em] text-white/55 sm:flex">
              <Guitar className="size-3.5" aria-hidden="true" /> CentralIA · música
            </div>
          </div>

          <form
            onSubmit={onSearch}
            className="mt-6 flex items-center gap-2 rounded-[3px] bg-white p-1.5 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.7)]"
          >
            <Search className="ml-2 size-5 shrink-0 text-[#8a97a8]" aria-hidden="true" />
            <label htmlFor="songbook-search" className="sr-only">Buscar música, artista ou estilo</label>
            <input
              id="songbook-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedId(null);
              }}
              placeholder="Busque uma música, artista ou estilo…"
              className="min-w-0 flex-1 bg-transparent py-2 text-[0.9375rem] text-[#12233b] outline-none placeholder:text-[#9aa6b5]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
                className="rounded p-1 text-[#8a97a8] hover:bg-[#f1f4f7] hover:text-[#12233b]"
              >
                <X className="size-4" />
              </button>
            ) : null}
            <button
              type="submit"
              className="rounded-[3px] bg-[#e8663d] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d4562f]"
            >
              Buscar
            </button>
          </form>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por estilo">
            {GENRES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={genre === item}
                onClick={() => {
                  setGenre(item);
                  setSelectedId(null);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  genre === item
                    ? "border-[#e8663d] bg-[#e8663d] text-white"
                    : "border-white/20 text-white/70 hover:border-white/50 hover:text-white",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div id="songbook-results" className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        {selected ? (
          <SongDetail
            song={selected}
            effective={transpose + capo}
            transpose={transpose}
            capo={capo}
            onBack={() => setSelectedId(null)}
            onTranspose={(delta) => setTranspose((value) => Math.max(-5, Math.min(7, value + delta)))}
            onCapo={setCapo}
            onReset={() => {
              setTranspose(0);
              setCapo(0);
            }}
          />
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-[#e8663d]">
                  <span className="inline-block h-px w-5 bg-[#e8663d]" />
                  {normalizedQuery ? "resultados da busca" : genre === "Todos" ? "o mais tocado" : `estilo · ${genre}`}
                </div>
                <h2 className="font-display text-3xl font-bold leading-tight text-[#12233b] md:text-4xl">
                  {normalizedQuery ? `“${query.trim()}”` : genre === "Todos" ? "Músicas em alta" : genre}
                </h2>
              </div>
              <span className="readout text-xs uppercase tracking-wider text-[#8a97a8]">
                {filtered.length} cifra{filtered.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <section aria-label="Lista de cifras">
                <ol className="divide-y divide-[#e8ebef] border-y border-[#e8ebef]">
                  {filtered.map((song, index) => (
                    <li key={song.id}>
                      <button
                        type="button"
                        onClick={() => openSong(song.id)}
                        className="group flex w-full items-center gap-3 py-3.5 text-left transition-colors hover:bg-white sm:gap-4"
                      >
                        <span className="readout w-8 shrink-0 text-base text-[#aab4c2]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-[#1f4e79] group-hover:underline">
                            {song.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.8125rem] text-[#66748a]">
                            {song.artist}
                          </span>
                        </span>
                        <span className="hidden shrink-0 rounded-[3px] border border-[#d9dee6] bg-white px-2 py-1 readout text-xs text-[#12233b] sm:inline">
                          {song.key}
                        </span>
                        <ChevronRight
                          className="size-4 shrink-0 text-[#b3bdc9] transition-transform group-hover:translate-x-0.5 group-hover:text-[#e8663d]"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  ))}
                </ol>

                {filtered.length === 0 ? (
                  <div className="border-y border-[#e8ebef] py-14 text-center">
                    <Search className="mx-auto size-7 text-[#b3bdc9]" aria-hidden="true" />
                    <p className="mt-3 font-semibold text-[#12233b]">Nenhuma cifra encontrada</p>
                    <p className="mt-1 text-sm text-[#66748a]">Tente outro título, artista ou estilo.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setGenre("Todos");
                      }}
                      className="mt-4 text-sm font-semibold text-[#1f4e79] underline underline-offset-4"
                    >
                      Limpar filtros
                    </button>
                  </div>
                ) : null}

                <div className="mt-9">
                  <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-[#12233b]">
                    <Music2 className="size-4 text-[#e8663d]" aria-hidden="true" /> Tocadas recentemente
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {recentSongs.map((song) => (
                      <button
                        key={song.id}
                        type="button"
                        onClick={() => openSong(song.id)}
                        className="group flex items-center gap-3 rounded-[3px] border border-[#e8ebef] bg-white px-3.5 py-3 text-left transition-colors hover:border-[#1f4e79]/40"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-[3px] bg-[#eef3f8] text-[#1f4e79]">
                          <Disc3 className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[#12233b] group-hover:text-[#1f4e79]">
                            {song.title}
                          </span>
                          <span className="block truncate text-xs text-[#66748a]">{song.artist}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <aside className="space-y-5" aria-label="Navegação do songbook">
                <SideCard title="Artistas populares" icon={UserRound}>
                  <ul className="space-y-0.5">
                    {ALL_ARTISTS.map((artist) => (
                      <li key={artist}>
                        <button
                          type="button"
                          onClick={() => selectArtist(artist)}
                          className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm text-[#24354d] hover:bg-[#f2f5f8] hover:text-[#1f4e79]"
                        >
                          <span className="size-1.5 shrink-0 rounded-full bg-[#e8663d]" />
                          <span className="truncate">{artist}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </SideCard>

                <SideCard title="Acordes básicos" icon={Guitar}>
                  <div className="grid grid-cols-3 gap-3">
                    {["C", "G", "Am", "F", "D", "Em"].map((chord) => (
                      <div
                        key={chord}
                        className="rounded-[3px] border border-[#e8ebef] bg-white px-2 pb-1.5 pt-2 text-center"
                      >
                        <ChordDiagram
                          name={chord}
                          shape={CHORD_SHAPES[chord]!}
                          className="mx-auto max-w-[4.25rem]"
                        />
                        <span className="readout mt-0.5 block text-xs font-semibold text-[#12233b]">
                          {chord}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-[#8a97a8]">
                    Abra uma música para ver os acordes e mudar o tom.
                  </p>
                </SideCard>

                <div className="rounded-[3px] border border-[#e8ebef] bg-[#eef3f8] p-4">
                  <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[#1f4e79]">
                    Songbook CentralIA
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[#52637a]">
                    Cifras ilustrativas para demonstrar a interface. O Laboratório MIDI abaixo usa o
                    agente real de teoria musical.
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>

      <section className="border-t border-[#e8ebef] bg-[#f1f3f6]">
        <div className="mx-auto max-w-6xl px-5 py-9 md:px-8">
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-block h-px w-5 bg-[#1f4e79]" />
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-[#66748a]">
              instrumento · agente de teoria simbólica
            </span>
          </div>
          <div className="panel bay railed rounded-[4px] bg-[#101b2d] p-5 md:p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h3 className="font-display text-2xl font-semibold uppercase tracking-tight text-[#f5f7fa]">
                  Laboratório MIDI
                </h3>
                <p className="mt-1 text-sm text-[#9aa6b5]">
                  Identifique acordes, transponha notas e gere tablaturas a partir de notas MIDI.
                </p>
              </div>
              <span className="readout rounded-[3px] border border-[#2c3d55] px-2 py-1 text-[0.625rem] uppercase tracking-wider text-[#9aa6b5]">
                C4 = 60 · violão
              </span>
            </div>
            <Tabs defaultValue="form">
              <TabsList className="mb-4">
                <TabsTrigger value="form">Formulário</TabsTrigger>
                <TabsTrigger value="text">Linguagem natural</TabsTrigger>
              </TabsList>
              <TabsContent value="form">
                <div className="grid gap-4 md:grid-cols-[14rem_1fr_8rem_auto] md:items-end">
                  <div className="space-y-1">
                    <Label>Ação</Label>
                    <div className="flex gap-1">
                      {(["identify_chord", "transpose", "tab"] as const).map((item) => (
                        <Button
                          key={item}
                          type="button"
                          size="sm"
                          variant={action === item ? "signal" : "outline"}
                          onClick={() => setAction(item)}
                        >
                          {item === "identify_chord" ? "acorde" : item === "transpose" ? "transpor" : "tab"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="notes">Notas MIDI</Label>
                    <Input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="readout" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="semi">Semitons</Label>
                    <Input
                      id="semi"
                      value={semitones}
                      disabled={action !== "transpose"}
                      onChange={(event) => setSemitones(event.target.value)}
                      className="readout"
                    />
                  </div>
                  <Button variant="signal" onClick={submitForm} disabled={m.isPending}>
                    Rodar
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="text">
                <Textarea
                  rows={3}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Ex.: transponha 60 64 67 dois semitons acima"
                />
                <Button
                  className="mt-3"
                  variant="signal"
                  disabled={m.isPending || !text.trim()}
                  onClick={() => m.mutate({ text })}
                >
                  {m.isPending ? "Processando…" : "Enviar"}
                </Button>
              </TabsContent>
            </Tabs>
            {m.error ? <p className="mt-4 text-sm text-destructive">{(m.error as Error).message}</p> : null}
            <Outcome result={m.data} />
          </div>
          <p className="mt-3 text-xs text-[#7f8b9c]">
            As cifras acima são ilustrativas; esta seção executa o mesmo agente de música usado pelo CentralIA.
          </p>
        </div>
      </section>
    </div>
  );
}

function SideCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Guitar;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[3px] border border-[#e8ebef] bg-white p-4">
      <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-[#12233b]">
        <Icon className="size-4 text-[#e8663d]" aria-hidden="true" /> {title}
      </h3>
      {children}
    </div>
  );
}

function SongDetail({
  song,
  effective,
  transpose,
  capo,
  onBack,
  onTranspose,
  onCapo,
  onReset,
}: {
  song: DemoSong;
  effective: number;
  transpose: number;
  capo: number;
  onBack: () => void;
  onTranspose: (delta: number) => void;
  onCapo: (value: number) => void;
  onReset: () => void;
}) {
  const chordNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const chord of song.chords) map[chord] = transposeChord(chord, effective);
    return map;
  }, [song, effective]);

  const usedChords = [
    ...new Map<string, ChordShape>(
      song.chords.map((chord): [string, ChordShape] => [transposeChord(chord, effective), shapeFor(chord, effective)]),
    ).entries(),
  ];

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-semibold text-[#1f4e79] hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Todas as cifras
      </button>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-5 border-b border-[#e8ebef] pb-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-[#e8663d]">
            <span className="inline-block h-px w-5 bg-[#e8663d]" />
            cifra · {song.genre}
          </div>
          <h2 className="font-display text-3xl font-bold leading-tight text-[#12233b] md:text-[2.5rem]">
            {song.title}
          </h2>
          <p className="mt-1.5 text-sm text-[#66748a]">{song.artist}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[#eef3f8] px-3 py-1.5 text-xs font-semibold text-[#1f4e79]">
            Tom {song.key}
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#52637a] ring-1 ring-[#e8ebef]">
            {song.level}
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[3px] border border-[#e8ebef] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(18,35,59,0.04)]">
        <div className="flex items-center gap-2.5">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[#66748a]">Tom</span>
          <button
            type="button"
            onClick={() => onTranspose(-1)}
            aria-label="Diminuir um semitom"
            className="grid size-8 place-items-center rounded-[3px] border border-[#d9dee6] text-[#12233b] hover:bg-[#f2f5f8]"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span className="readout min-w-[6.5rem] text-center text-base font-semibold text-[#1f4e79]">
            {song.key} → {transposeChord(song.key, effective)}
          </span>
          <button
            type="button"
            onClick={() => onTranspose(1)}
            aria-label="Aumentar um semitom"
            className="grid size-8 place-items-center rounded-[3px] border border-[#d9dee6] text-[#12233b] hover:bg-[#f2f5f8]"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[#66748a]">
            Capo
          </span>
          {[0, 1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={capo === value}
              onClick={() => onCapo(value)}
              className={cn(
                "readout grid size-7 place-items-center rounded-[3px] border text-xs transition-colors",
                capo === value
                  ? "border-[#12233b] bg-[#12233b] text-white"
                  : "border-[#d9dee6] text-[#52637a] hover:bg-[#f2f5f8]",
              )}
            >
              {value}
            </button>
          ))}
        </div>
        {transpose !== 0 || capo !== 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[#e8663d] hover:underline"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" /> Voltar ao original
          </button>
        ) : null}
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="rounded-[3px] border border-[#e8ebef] bg-white p-5 shadow-[0_1px_2px_rgba(18,35,59,0.04)] md:p-7">
          <div className="mb-6 flex items-center justify-between border-b border-[#eef1f4] pb-3">
            <h3 className="font-display text-base font-semibold text-[#12233b]">Letra e cifra</h3>
            <span className="readout text-xs text-[#8a97a8]">tom {transposeChord(song.key, effective)}</span>
          </div>
          <div className="space-y-6">
            {song.lyrics.map((line, lineIndex) => (
              <div key={lineIndex} className="flex flex-wrap gap-x-8 gap-y-1">
                {line.map((segment, segmentIndex) => (
                  <div key={segmentIndex} className="min-w-[7rem]">
                    <div className="readout text-sm font-bold text-[#e8663d]">
                      {chordNames[segment.chord] ?? segment.chord}
                    </div>
                    <div className="text-[0.9375rem] leading-7 text-[#24354d]">{segment.text}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-8 border-t border-[#eef1f4] pt-4 text-xs leading-relaxed text-[#8a97a8]">
            Cifras e trechos ilustrativos criados para demonstrar a interface — não são transcrições de gravações.
          </p>
        </section>

        <aside className="space-y-5">
          <div className="rounded-[3px] border border-[#e8ebef] bg-white p-5">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-[#12233b]">
              Acordes usados
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
              {usedChords.map(([name, shape]) => (
                <div key={name} className="text-center">
                  <ChordDiagram name={name} shape={shape} className="mx-auto max-w-[5.25rem]" />
                  <div className="readout mt-1 text-xs font-semibold text-[#12233b]">{name}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[3px] border border-[#e8ebef] bg-[#eef3f8] p-4">
            <h3 className="font-display text-sm font-semibold text-[#12233b]">Como mudar o tom</h3>
            <p className="mt-2 text-xs leading-relaxed text-[#52637a]">
              Use os botões <strong className="font-semibold text-[#1f4e79]">−</strong> e{" "}
              <strong className="font-semibold text-[#1f4e79]">+</strong> para transpor a cifra inteira. O capo
              soma ao tom exibido, como acontece no violão.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
