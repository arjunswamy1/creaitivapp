import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch ALL ringba_calls rows for a client+date range with pagination
 * (Supabase default 1000-row limit otherwise drops data on busy clients).
 */
export async function fetchAllRingbaCalls<T = any>(
  clientId: string,
  fromIso: string,
  toIso: string,
  columns: string
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const all: T[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("ringba_calls")
      .select(columns)
      .eq("client_id", clientId)
      .gte("call_date", fromIso)
      .lte("call_date", toIso)
      .order("call_date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from > 50000) break; // safety
  }

  return all;
}
