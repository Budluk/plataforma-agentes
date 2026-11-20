import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { readSitePublications } from "@/lib/api/publications.functions";
import { pageHead } from "@/lib/core/pageHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const siteQuery = queryOptions({ queryKey: ["site-publications"], queryFn: () => readSitePublications() });
export const Route = createFileRoute("/site")({
  head: () => pageHead("CentralIA — Conteúdos publicados", "Conteúdos revisados e aprovados pelo operador da CentralIA."),
  loader: ({ context }) => context.queryClient.ensureQueryData(siteQuery), component: Site,
});
function Site() {
  const { data } = useSuspenseQuery(siteQuery);
  return <div className="min-h-screen bg-background"><header className="mx-auto flex max-w-4xl items-center justify-between border-b border-border px-5 py-5"><Link to="/" className="readout text-lg font-semibold">Central<span className="text-primary">IA</span></Link><Button asChild variant="outline" size="sm"><Link to="/painel">Painel</Link></Button></header><main className="mx-auto max-w-4xl px-5 py-10"><h1 className="text-3xl font-semibold">Conteúdos publicados</h1>{!data.length && <p className="mt-10 text-muted-foreground">Nenhum conteúdo publicado ainda.</p>}<div className="mt-8 divide-y divide-border">{data.map((p) => <article id={`publicacao-${p.id}`} key={p.id} className="py-8 first:pt-0"><time className="readout text-xs text-muted-foreground">{new Date(p.published_at).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</time><h2 className="mt-3 break-words text-2xl font-semibold">{p.hook}</h2><p className="mt-5 whitespace-pre-wrap break-words leading-relaxed">{p.script}</p><p className="mt-5 whitespace-pre-wrap break-words text-muted-foreground">{p.caption}</p><div className="mt-5 flex flex-wrap gap-2">{p.hashtags.map((tag) => <Badge key={tag} variant="muted">{tag}</Badge>)}</div></article>)}</div></main></div>;
}