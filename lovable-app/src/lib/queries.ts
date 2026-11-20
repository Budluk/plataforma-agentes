import { queryOptions } from "@tanstack/react-query";
import {
  getAccess,
  getFinanceState,
  getOverview,
  listDevOutputs,
} from "@/lib/api/agents.functions";
import { getAgentSettings } from "@/lib/api/settings.functions";
import { listApprovals, getAudit } from "@/lib/api/control.functions";
import { getTrendReport, listContent, listPersonas } from "@/lib/api/content.functions";
import { getStudioInfo } from "@/lib/api/studio.functions";
import type { WindowMode } from "@/lib/core/trends";

export const accessQuery = queryOptions({
  queryKey: ["access"],
  queryFn: () => getAccess(),
  staleTime: 60_000,
});
export const overviewQuery = queryOptions({ queryKey: ["overview"], queryFn: () => getOverview() });
export const financeQuery = queryOptions({
  queryKey: ["finance"],
  queryFn: () => getFinanceState(),
});
export const devOutputsQuery = queryOptions({
  queryKey: ["dev-outputs"],
  queryFn: () => listDevOutputs(),
});
export const approvalsQuery = (status?: string) =>
  queryOptions({
    queryKey: ["approvals", status ?? "all"],
    queryFn: () => listApprovals({ data: { status: status as never } }),
  });
export const auditQuery = queryOptions({
  queryKey: ["audit"],
  queryFn: () => getAudit({ data: { tail: 30 } }),
});
export const personasQuery = queryOptions({
  queryKey: ["personas"],
  queryFn: () => listPersonas(),
});
export const contentQuery = queryOptions({ queryKey: ["content"], queryFn: () => listContent() });
export const trendsQuery = (mode: WindowMode, windowHours: number) =>
  queryOptions({
    queryKey: ["trends", mode, windowHours],
    queryFn: () => getTrendReport({ data: { mode, windowHours } }),
  });
export const studioInfoQuery = queryOptions({
  queryKey: ["studio-info"],
  queryFn: () => getStudioInfo(),
  staleTime: 30_000,
});
export const agentSettingsQuery = queryOptions({
  queryKey: ["agent-settings"],
  queryFn: () => getAgentSettings(),
});
