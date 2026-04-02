import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StellarResponse, StellarStatusFilter } from "@/types/stellar";

export function useStellarExperiments(
  verticalId: string,
  statusFilter: StellarStatusFilter = "all"
) {
  return useQuery<StellarResponse>({
    queryKey: ["stellar-experiments", verticalId, statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = { vertical: verticalId };
      if (statusFilter !== "all") params.status = statusFilter;

      const queryStr = new URLSearchParams(params).toString();
      const { data, error } = await supabase.functions.invoke("api-stellar", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: undefined,
      });

      // supabase.functions.invoke doesn't support query params well,
      // so call via fetch directly
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/api-stellar?${queryStr}`,
        {
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
        }
      );

      if (res.status === 401) throw new Error("unauthorized");
      if (res.status === 429) throw new Error("rate_limited");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API error ${res.status}`);
      }

      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min client cache
    retry: (count, error) => {
      if ((error as Error).message === "rate_limited") return count < 2;
      if ((error as Error).message === "unauthorized") return false;
      return count < 2;
    },
  });
}
