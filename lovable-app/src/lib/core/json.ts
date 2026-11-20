import type { Json } from "@/integrations/supabase/types";
export type { Json };

/** Round-trips a value through JSON so only plain data crosses the server boundary. */
export const toJson = (v: unknown): Json => (v === undefined ? null : (JSON.parse(JSON.stringify(v)) as Json));

export function outcomeDto<T extends { data: unknown }>(o: T): Omit<T, "data"> & { data: Json | null } {
  return { ...o, data: o.data == null ? null : toJson(o.data) };
}
