import { z } from "zod";

const fin = () => z.number().finite();

export const AnalystProposal = z
  .object({
    asset: z.string().min(1).max(20),
    direction: z.enum(["LONG", "SHORT"]),
    entry_price: fin().gt(0),
    stop_price: fin().gt(0),
    target_price: fin().gt(0),
    confidence: fin().min(0).max(1),
    thesis: z.string().max(1000),
  })
  .strict();
export type AnalystProposal = z.infer<typeof AnalystProposal>;

export const PortfolioState = z
  .object({
    equity: fin().nullable().default(null),
    daily_pnl_pct: fin().nullable().default(null),
    equity_snapshot_consistent: z.boolean().default(false),
  })
  .strict();
export type PortfolioState = z.infer<typeof PortfolioState>;

export interface ComputedRisk {
  stop_distance_pct: number;
  reward_risk_ratio: number;
  levels_coherent: boolean;
}
export interface RiskDecision {
  approved: boolean;
  reasons: string[];
}

export const AlertEvent = z
  .object({
    asset: z.string(),
    direction: z.enum(["LONG", "SHORT"]),
    entry_price: z.number(),
    stop_price: z.number(),
    target_price: z.number(),
    reward_risk_ratio: z.number(),
    message: z.string(),
    data_source: z.string().default(""),
    data_age_minutes: z.number().int().nullable().default(null),
  })
  .strict();
export type AlertEvent = z.infer<typeof AlertEvent>;

export const ToolCall = z
  .object({ agent: z.string(), tool: z.string(), params: z.record(z.unknown()).default({}) })
  .strict();
export type ToolCall = z.infer<typeof ToolCall>;

export interface MonitorVerdict {
  allowed: boolean;
  head: string;
  reason: string;
}

export const RouteDecision = z
  .object({
    area: z.enum(["finance", "music", "sales", "funnel", "research", "dev", "studio", "none"]),
    reason: z.string().max(200).default(""),
  })
  .strict();
