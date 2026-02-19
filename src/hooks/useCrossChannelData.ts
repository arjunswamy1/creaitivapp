import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useClient } from "@/contexts/ClientContext";
import { format, differenceInDays, subDays, addDays } from "date-fns";

function useDateStrings() {
  const { dateRange } = useDateRange();
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  const days = differenceInDays(dateRange.to, dateRange.from) + 1;
  const prevFrom = format(subDays(dateRange.from, days), "yyyy-MM-dd");
  const prevTo = format(subDays(dateRange.from, 1), "yyyy-MM-dd");
  return { fromStr, toStr, prevFrom, prevTo, days, dateRange };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export interface CrossChannelKPIs {
  totalSpend: number;
  googleSpend: number;
  metaSpend: number;
  newSubscriptions: number;
  totalCAC: number;
  totalRevenue: number;
  blendedROAS: number;
  changes: {
    totalSpend: number | null;
    googleSpend: number | null;
    metaSpend: number | null;
    newSubscriptions: number | null;
    totalCAC: number | null;
    totalRevenue: number | null;
    blendedROAS: number | null;
  };
}

async function fetchSubblySubs(clientId: string, fromStr: string, toStr: string, dateRange: { from: Date; to: Date }) {
  const fromUTC = fromStr + "T05:00:00.000Z";
  const toNextDay = format(addDays(dateRange.to, 1), "yyyy-MM-dd");
  const toUTC = toNextDay + "T04:59:59.999Z";

  const { data, error } = await supabase
    .from("subbly_subscriptions")
    .select("id")
    .eq("client_id", clientId)
    .gte("subbly_created_at", fromUTC)
    .lte("subbly_created_at", toUTC);

  if (error) throw error;
  return (data || []).length;
}

async function fetchAdSpendByPlatform(clientId: string | undefined, fromStr: string, toStr: string) {
  let query = supabase
    .from("ad_daily_metrics")
    .select("platform, spend, revenue")
    .gte("date", fromStr)
    .lte("date", toStr);

  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) throw error;

  let googleSpend = 0, metaSpend = 0, totalRevenue = 0;
  for (const row of data || []) {
    const spend = Number(row.spend);
    const rev = Number(row.revenue);
    if (row.platform === "google") googleSpend += spend;
    else if (row.platform === "meta") metaSpend += spend;
    totalRevenue += rev;
  }
  return { googleSpend: Math.round(googleSpend), metaSpend: Math.round(metaSpend), totalSpend: Math.round(googleSpend + metaSpend), totalRevenue: Math.round(totalRevenue) };
}

export function useCrossChannelKPIs() {
  const { fromStr, toStr, prevFrom, prevTo, dateRange } = useDateStrings();
  const { activeClient, dashboardConfig } = useClient();
  const clientId = activeClient?.id;
  const subblyEnabled = dashboardConfig?.enabled_platforms?.includes("subbly") ?? false;

  return useQuery({
    queryKey: ["cross-channel-kpis", fromStr, toStr, clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<CrossChannelKPIs> => {
      if (!clientId) throw new Error("No client");

      // Current period
      const [currentAds, currentSubs] = await Promise.all([
        fetchAdSpendByPlatform(clientId, fromStr, toStr),
        subblyEnabled ? fetchSubblySubs(clientId, fromStr, toStr, dateRange) : Promise.resolve(0),
      ]);

      // Previous period
      const prevDateRange = { from: subDays(dateRange.from, differenceInDays(dateRange.to, dateRange.from) + 1), to: subDays(dateRange.from, 1) };
      const [prevAds, prevSubs] = await Promise.all([
        fetchAdSpendByPlatform(clientId, prevFrom, prevTo),
        subblyEnabled ? fetchSubblySubs(clientId, prevFrom, prevTo, prevDateRange) : Promise.resolve(0),
      ]);

      const currentCAC = currentSubs > 0 ? Math.round((currentAds.totalSpend / currentSubs) * 100) / 100 : 0;
      const prevCAC = prevSubs > 0 ? Math.round((prevAds.totalSpend / prevSubs) * 100) / 100 : 0;
      const currentROAS = currentAds.totalSpend > 0 ? Math.round((currentAds.totalRevenue / currentAds.totalSpend) * 100) / 100 : 0;
      const prevROAS = prevAds.totalSpend > 0 ? Math.round((prevAds.totalRevenue / prevAds.totalSpend) * 100) / 100 : 0;

      return {
        totalSpend: currentAds.totalSpend,
        googleSpend: currentAds.googleSpend,
        metaSpend: currentAds.metaSpend,
        newSubscriptions: currentSubs,
        totalCAC: currentCAC,
        totalRevenue: currentAds.totalRevenue,
        blendedROAS: currentROAS,
        changes: {
          totalSpend: pctChange(currentAds.totalSpend, prevAds.totalSpend),
          googleSpend: pctChange(currentAds.googleSpend, prevAds.googleSpend),
          metaSpend: pctChange(currentAds.metaSpend, prevAds.metaSpend),
          newSubscriptions: pctChange(currentSubs, prevSubs),
          totalCAC: pctChange(currentCAC, prevCAC),
          totalRevenue: pctChange(currentAds.totalRevenue, prevAds.totalRevenue),
          blendedROAS: pctChange(currentROAS, prevROAS),
        },
      };
    },
  });
}

export function useSpendSubsDaily() {
  const { fromStr, toStr, dateRange } = useDateStrings();
  const { activeClient, dashboardConfig } = useClient();
  const clientId = activeClient?.id;
  const subblyEnabled = dashboardConfig?.enabled_platforms?.includes("subbly") ?? false;

  return useQuery({
    queryKey: ["spend-subs-daily", fromStr, toStr, clientId],
    enabled: !!clientId,
    queryFn: async () => {
      if (!clientId) return [];

      // Fetch ad spend by day
      const { data: adData, error: adErr } = await supabase
        .from("ad_daily_metrics")
        .select("date, platform, spend")
        .eq("client_id", clientId)
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date", { ascending: true });

      if (adErr) throw adErr;

      // Fetch daily new subscriptions
      let subsByDay = new Map<string, number>();
      if (subblyEnabled) {
        const fromUTC = fromStr + "T00:00:00.000Z";
        const toNextDay = format(addDays(dateRange.to, 1), "yyyy-MM-dd");
        const toUTC = toNextDay + "T23:59:59.999Z";

        const { data: subsData, error: subsErr } = await supabase
          .from("subbly_subscriptions")
          .select("subbly_created_at")
          .eq("client_id", clientId)
          .gte("subbly_created_at", fromUTC)
          .lte("subbly_created_at", toUTC);

        if (subsErr) throw subsErr;

        for (const row of subsData || []) {
          if (!row.subbly_created_at) continue;
          const day = row.subbly_created_at.split("T")[0];
          subsByDay.set(day, (subsByDay.get(day) || 0) + 1);
        }
      }

      // Merge by date
      const byDate = new Map<string, { metaSpend: number; googleSpend: number; newSubs: number }>();

      // Initialize all dates in range
      let d = new Date(dateRange.from);
      while (d <= dateRange.to) {
        const key = format(d, "yyyy-MM-dd");
        byDate.set(key, { metaSpend: 0, googleSpend: 0, newSubs: subsByDay.get(key) || 0 });
        d = addDays(d, 1);
      }

      for (const row of adData || []) {
        const existing = byDate.get(row.date) || { metaSpend: 0, googleSpend: 0, newSubs: subsByDay.get(row.date) || 0 };
        if (row.platform === "meta") existing.metaSpend += Number(row.spend);
        else if (row.platform === "google") existing.googleSpend += Number(row.spend);
        byDate.set(row.date, existing);
      }

      return Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({
          date: new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          metaSpend: Math.round(vals.metaSpend),
          googleSpend: Math.round(vals.googleSpend),
          newSubs: vals.newSubs,
        }));
    },
  });
}
