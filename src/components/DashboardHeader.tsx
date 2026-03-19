import { RefreshCw, Settings, Target, Cpu, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DateRangePicker from "@/components/DateRangePicker";
import AccountSelector from "@/components/AccountSelector";
import ClientSwitcher from "@/components/ClientSwitcher";
import { useClient } from "@/contexts/ClientContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface ExpiredConnection {
  platform: string;
  token_expires_at: string | null;
}

const DashboardHeader = () => {
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [expiredPlatforms, setExpiredPlatforms] = useState<string[]>([]);
  const { activeClient, isAgencyAdmin } = useClient();
  const { logoUrl, clientName } = useBranding();
  const queryClient = useQueryClient();

  // Check for expired tokens
  useEffect(() => {
    const checkTokenExpiry = async () => {
      const clientId = activeClient?.id;
      let query = supabase
        .from("platform_connections")
        .select("platform, token_expires_at");

      if (clientId) {
        query = query.eq("client_id", clientId);
      }

      const { data } = await query;
      if (data) {
        const now = new Date();
        const expired = (data as ExpiredConnection[])
          .filter((c) => c.token_expires_at && new Date(c.token_expires_at) < now)
          .map((c) => c.platform.charAt(0).toUpperCase() + c.platform.slice(1));
        setExpiredPlatforms(expired);
      }
    };
    checkTokenExpiry();
  }, [activeClient?.id]);

  useEffect(() => {
    const fetchLastSync = async () => {
      const { data } = await supabase
        .from("ad_sync_log")
        .select("completed_at")
        .eq("status", "success")
        .order("completed_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0 && data[0].completed_at) {
        setLastSynced(data[0].completed_at);
      }
    };
    fetchLastSync();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const clientId = activeClient?.id || null;

      // Run Meta and Google syncs in parallel – scoped to active client only
      const [metaResult, googleResult] = await Promise.allSettled([
        supabase.functions.invoke("sync-meta-ads", { body: { client_id: clientId } }),
        supabase.functions.invoke("sync-google-ads", { body: { client_id: clientId, days_back: 90 } }),
      ]);

      const [subblyResult, shopifyResult] = await Promise.allSettled([
        supabase.functions.invoke("sync-subbly", { body: { client_id: clientId } }),
        supabase.functions.invoke("sync-shopify-orders", { body: { client_id: clientId } }),
      ]);

      const errors: string[] = [];
      let totalSynced = 0;

      if (metaResult.status === "fulfilled" && !metaResult.value.error) {
        totalSynced += metaResult.value.data?.results?.reduce((sum: number, r: any) => sum + (r.records_synced || 0), 0) || 0;
      } else {
        errors.push("Meta");
      }

      if (googleResult.status === "fulfilled" && !googleResult.value.error) {
        totalSynced += googleResult.value.data?.records_synced || 0;
      } else {
        errors.push("Google");
      }

      if (subblyResult.status === "fulfilled" && !subblyResult.value.error) {
        totalSynced += (subblyResult.value.data?.subscriptions_synced || 0) + (subblyResult.value.data?.invoices_synced || 0);
      } else {
        errors.push("Subbly");
      }

      if (shopifyResult.status === "fulfilled" && !shopifyResult.value.error) {
        totalSynced += shopifyResult.value.data?.records_synced || 0;
      } else {
        errors.push("Shopify");
      }

      setLastSynced(new Date().toISOString());
      queryClient.invalidateQueries();

      if (errors.length > 0) {
        toast.warning(`Synced ${totalSynced} records (${errors.join(", ")} failed)`);
      } else {
        toast.success(`Synced ${totalSynced} records`);
      }
    } catch (err: any) {
      toast.error("Sync failed: " + (err.message || "Unknown error"));
    } finally {
      setSyncing(false);
    }
  };

  const formatRelativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <header className="flex items-center justify-between py-6 gap-4">
      <div className="flex items-center gap-4 shrink-0">
        {logoUrl && (
          <img src={logoUrl} alt={clientName} className="h-12 w-auto rounded-lg" />
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
            {clientName}
          </h1>
          <p className="text-sm text-muted-foreground">Performance</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {expiredPlatforms.length > 0 && isAgencyAdmin && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/settings">
                  <Badge variant="destructive" className="gap-1 cursor-pointer text-xs animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    {expiredPlatforms.length === 1
                      ? `${expiredPlatforms[0]} expired`
                      : `${expiredPlatforms.length} tokens expired`}
                  </Badge>
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>{expiredPlatforms.join(", ")} — click to re-authenticate in Settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {isAgencyAdmin && <ClientSwitcher />}
        <AccountSelector />
        {isAgencyAdmin && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                  className="gap-1.5 text-xs text-muted-foreground"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {lastSynced ? formatRelativeTime(lastSynced) : "Sync"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{syncing ? "Syncing..." : lastSynced ? `Last synced: ${new Date(lastSynced).toLocaleString()}` : "Click to sync"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <DateRangePicker />
        {isAgencyAdmin && (
          <Link to="/optimization">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
              <Cpu className="w-3.5 h-3.5" />
              Optimize
            </Button>
          </Link>
        )}
        {isAgencyAdmin && (
          <Link to="/budget-planner">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
              <Target className="w-3.5 h-3.5" />
              Budget Planner
            </Button>
          </Link>
        )}
        {isAgencyAdmin && (
          <Link to="/settings">
            <Button variant="ghost" size="icon">
              <Settings className="w-5 h-5" />
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
};

export default DashboardHeader;
