import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Signed in AND holds the operator role. Every platform function goes through this. */
export const requireOperator = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !data) throw new Error("Acesso restrito ao operador desta plataforma.");
    const claims = context.claims as { email?: string };
    return next({ context: { operator: claims.email ?? context.userId } });
  });
