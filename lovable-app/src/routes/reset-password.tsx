import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha — CentralIA" },
      { name: "description", content: "Defina uma nova senha de acesso à CentralIA." },
      { property: "og:title", content: "Nova senha — CentralIA" },
      { property: "og:description", content: "Defina uma nova senha de acesso à CentralIA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use pelo menos 8 caracteres.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha atualizada.");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="console-grid flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-6">
        <div>
          <div className="eyebrow">recuperação</div>
          <h1 className="mt-1 text-2xl font-semibold">Nova senha</h1>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw">Senha nova</Label>
          <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" variant="signal" className="w-full" disabled={busy}>
          Salvar senha
        </Button>
      </form>
    </div>
  );
}
