import type { AnalystProposal, ComputedRisk, PortfolioState, RiskDecision } from "./contracts";

export const MAX_DAILY_LOSS_PCT = 2.0;
export const MAX_STOP_DISTANCE_PCT = 5.0;
export const MIN_REWARD_RISK = 1.5;

/** Tool names that can never exist in this system. */
export const FORBIDDEN_TOOL_TOKENS = [
  "execution_order", "place_order", "submit_order", "send_order", "checkout", "purchase", "payment", "charge_card",
  "launch_campaign", "set_budget", "send_whatsapp", "publish_page", "submit_form", "post_form", "login", "download",
  "execute_code", "run_code", "run_script", "eval_code", "shell_command", "pip_install", "git_push", "deploy",
  // PT-BR mirrors of SENSIBLE_ACTIONS (comercial.ts): no alias may bypass the gate.
  "desconto_extraordinario", "alteracao_preco", "campanha_em_massa", "exclusao", "exportacao_dados",
  "contrato", "compromisso_financeiro", "alteracao_permissoes", "envio_mensagem", "enviar_mensagem",
  "pagamento", "checkout",
];

export class ExecutionToolForbidden extends Error {}

export function assertNoExecutionTool(toolName: string): void {
  const name = toolName.toLowerCase();
  for (const token of FORBIDDEN_TOOL_TOKENS) {
    if (name.includes(token)) throw new ExecutionToolForbidden(`ferramenta de execução vetada: '${toolName}'`);
  }
}

export function computeRisk(p: AnalystProposal): ComputedRisk {
  const risk = Math.abs(p.entry_price - p.stop_price);
  const reward = Math.abs(p.target_price - p.entry_price);
  const coherent =
    p.direction === "LONG"
      ? p.stop_price < p.entry_price && p.entry_price < p.target_price
      : p.target_price < p.entry_price && p.entry_price < p.stop_price;
  return {
    stop_distance_pct: (risk / p.entry_price) * 100,
    reward_risk_ratio: risk > 0 ? reward / risk : 0,
    levels_coherent: coherent,
  };
}

export function evaluateRisk(risk: ComputedRisk, portfolio: PortfolioState): RiskDecision {
  const reasons: string[] = [];
  if (portfolio.equity === null || portfolio.daily_pnl_pct === null) {
    reasons.push("dados do portfólio ausentes (falha fechada)");
  } else {
    if (portfolio.equity <= 0) reasons.push("equity não positivo");
    if (portfolio.daily_pnl_pct <= -MAX_DAILY_LOSS_PCT)
      reasons.push(`perda diária ${portfolio.daily_pnl_pct}% atingiu o limite de -${MAX_DAILY_LOSS_PCT}%`);
  }
  if (!portfolio.equity_snapshot_consistent) reasons.push("snapshot de equity inconsistente (falha fechada)");
  if (!risk.levels_coherent) reasons.push("níveis de entrada/stop/alvo incoerentes com a direção");
  if (risk.stop_distance_pct > MAX_STOP_DISTANCE_PCT)
    reasons.push(`stop a ${risk.stop_distance_pct.toFixed(2)}% excede ${MAX_STOP_DISTANCE_PCT}%`);
  if (risk.reward_risk_ratio < MIN_REWARD_RISK)
    reasons.push(`relação retorno/risco ${risk.reward_risk_ratio.toFixed(2)} abaixo de ${MIN_REWARD_RISK}`);
  return { approved: reasons.length === 0, reasons };
}
