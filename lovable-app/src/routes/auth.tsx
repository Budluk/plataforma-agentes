import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const safePath = (p?: string) => (p && p.startsWith("/") && !p.startsWith("//") ? p : "/painel");

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Entrar — CentralIA" },
      { name: "description", content: "Acesso do operador à central de agentes CentralIA." },
      { property: "og:title", content: "Entrar — CentralIA" },
      { property: "og:description", content: "Acesso do operador à central de agentes CentralIA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const target = safePath(redirect);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    // O OAuth volta para /auth sem a query original: o destino pretendido fica
    // no sessionStorage. Um único efeito e um único destino evitam que dois
    // redirects compitam e percam o deep link.
    const stored = sessionStorage.getItem("centralia:after-auth");
    const destination = safePath(stored ?? redirect);
    if (stored) sessionStorage.removeItem("centralia:after-auth");
    let active = true;
    const go = () => {
      if (active) navigate({ to: destination, replace: true });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) go();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [navigate, redirect]);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error)
      toast.error(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message,
      );
  }

  async function signUp(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + target },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) setSent(email);
  }

  async function forgot() {
    if (!email) {
      toast.error("Digite seu e-mail primeiro.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Enviamos um link para redefinir a senha.");
  }

  async function oauth(provider: "google" | "lovable") {
    sessionStorage.setItem("centralia:after-auth", target);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) toast.error("Não foi possível entrar agora.");
  }

  return (
    <div className="console-grid relative flex min-h-screen items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{
          background:
            "radial-gradient(60% 60% at 20% 0%, oklch(0.88 0.2 108 / 8%), transparent 70%)",
        }}
      />
      <div className="relative grid w-full max-w-4xl items-center gap-12 md:grid-cols-[0.9fr_1fr]">
        <div className="hidden md:block">
          <div className="readout text-lg font-semibold tracking-tight">
            Central<span className="text-primary">IA</span>
          </div>
          <div className="eyebrow mt-10">acesso do operador</div>
          <h1 className="mt-3 font-display text-5xl font-semibold uppercase leading-[0.94] tracking-tight">
            A central está <span className="text-primary">pronta</span> para despachar.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            A primeira conta criada vira a operadora da plataforma. Todo pedido passa por gates
            antes de virar execução.
          </p>
          <div className="mt-10 flex flex-col gap-2 border-l border-border pl-4">
            {["gates determinísticos", "aprovação humana", "auditoria encadeada"].map((item) => (
              <div
                key={item}
                className="readout flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"
              >
                <span className="signal-dot !h-1 !w-1 text-primary" /> {item}
              </div>
            ))}
          </div>
        </div>

        <div className="panel bay railed p-6 md:p-7">
          <div className="mb-8 md:hidden">
            <div className="eyebrow">acesso do operador</div>
            <h1 className="mt-2 font-display text-4xl font-semibold uppercase tracking-tight">
              Central<span className="text-primary">IA</span>
            </h1>
          </div>

          {sent ? (
            <div className="space-y-3 text-center">
              <div className="readout text-primary">verifique seu e-mail</div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Enviamos um link de confirmação para {sent}. Depois de confirmar, você entra direto.
              </p>
            </div>
          ) : (
            <Tabs defaultValue="signin">
              <TabsList className="mb-6 grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              {(["signin", "signup"] as const).map((mode) => (
                <TabsContent key={mode} value={mode}>
                  <form onSubmit={mode === "signin" ? signIn : signUp} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${mode}-email`}>E-mail</Label>
                      <Input
                        id={`${mode}-email`}
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${mode}-password`}>Senha</Label>
                      <Input
                        id={`${mode}-password`}
                        type="password"
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <Button type="submit" variant="signal" className="w-full" disabled={busy}>
                      {mode === "signin" ? "Entrar" : "Criar conta"}
                    </Button>
                    {mode === "signin" ? (
                      <button
                        type="button"
                        onClick={forgot}
                        className="w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Esqueci a senha
                      </button>
                    ) : null}
                  </form>
                </TabsContent>
              ))}
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="eyebrow">ou</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-2">
                <Button type="button" variant="outline" onClick={() => oauth("google")}>
                  Continuar com Google
                </Button>
                <Button type="button" variant="outline" onClick={() => oauth("lovable")}>
                  <LovableMark />
                  Continuar com Lovable
                </Button>
              </div>
            </Tabs>
          )}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            A primeira conta criada vira a operadora da plataforma.
          </p>
        </div>
      </div>
    </div>
  );
}
