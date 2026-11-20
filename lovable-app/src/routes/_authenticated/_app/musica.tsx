import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { runMusic } from "@/lib/api/agents.functions";
import { Outcome, PageHeader, Panel } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pageHead } from "@/lib/core/pageHead";

export const Route = createFileRoute("/_authenticated/_app/musica")({
  head: () => pageHead("Música — CentralIA", "Acorde, transposição e tablatura a partir de notas MIDI."),
  component: Musica,
});

function Musica() {
  const music = useServerFn(runMusic);
  const [text, setText] = useState("");
  const [action, setAction] = useState<"identify_chord" | "transpose" | "tab">("identify_chord");
  const [notes, setNotes] = useState("60 64 67");
  const [semitones, setSemitones] = useState("2");
  const m = useMutation({ mutationFn: (d: Parameters<typeof music>[0]["data"]) => music({ data: d }) });

  const submitForm = () => {
    const ns = notes.split(/[\s,]+/).filter(Boolean).map(Number);
    m.mutate({ request: { action, notes: ns, semitones: action === "transpose" ? Number(semitones) : 0 } });
  };

  return (
    <>
      <PageHeader eyebrow="área · música" title="Teoria simbólica (MIDI)" description="Acorde, transposição e tablatura de violão. Sem áudio: C4 = 60." />
      <Panel>
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
                  {(["identify_chord", "transpose", "tab"] as const).map((a) => (
                    <Button key={a} type="button" size="sm" variant={action === a ? "signal" : "outline"} onClick={() => setAction(a)}>
                      {a === "identify_chord" ? "acorde" : a === "transpose" ? "transpor" : "tab"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Notas MIDI</Label>
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="readout" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="semi">Semitons</Label>
                <Input id="semi" value={semitones} disabled={action !== "transpose"} onChange={(e) => setSemitones(e.target.value)} className="readout" />
              </div>
              <Button variant="signal" onClick={submitForm} disabled={m.isPending}>
                Rodar
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="text">
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: transponha 60 64 67 dois semitons acima" />
            <Button className="mt-3" variant="signal" disabled={m.isPending || !text.trim()} onClick={() => m.mutate({ text })}>
              {m.isPending ? "Processando…" : "Enviar"}
            </Button>
          </TabsContent>
        </Tabs>
        {m.error ? <p className="mt-4 text-sm text-destructive">{(m.error as Error).message}</p> : null}
        <Outcome result={m.data} />
      </Panel>
    </>
  );
}
