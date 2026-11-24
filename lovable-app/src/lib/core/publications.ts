import { paramsHash, sha256hex } from "./canonical";
import { PUBLISH_ACTION, PublishPost } from "./content";

export async function validatePublication(draft: { hook: string; script: string; caption: string; persona_id: string; content_hash: string }, approval: { action: string; params_json: string; params_hash: string; status: string; expires_ts: number }, now: number) {
  if (approval.action !== PUBLISH_ACTION || approval.status !== "approved" || approval.expires_ts <= now) throw new Error("Aprovação ausente, usada ou vencida.");
  let rawParams: unknown;
  try {
    rawParams = JSON.parse(approval.params_json);
  } catch {
    throw new Error("Parâmetros da aprovação ilegíveis.");
  }
  const parsed = PublishPost.safeParse(rawParams);
  if (!parsed.success) throw new Error("Parâmetros da aprovação fora do contrato.");
  const params = parsed.data;
  if (await paramsHash(params) !== approval.params_hash) throw new Error("Parâmetros diferentes dos aprovados.");
  if (params.content_hash !== draft.content_hash || params.persona_id !== draft.persona_id || params.caption !== draft.caption.slice(0, 2200) || await sha256hex(draft.hook + draft.script + draft.caption) !== draft.content_hash) throw new Error("O conteúdo não corresponde ao aprovado.");
  return params;
}