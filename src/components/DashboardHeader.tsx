import { BarChart3, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DateRangePicker from "@/components/DateRangePicker";
import AccountSelector from "@/components/AccountSelector";
import ClientSwitcher from "@/components/ClientSwitcher";
import { useClient } from "@/contexts/ClientContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const DashboardHeader = () => {
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { activeClient } = useClient();
  const queryClient = useQueryClient();

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
      const { data, error } = await supabase.functions.invoke("sync-meta-ads");
      if (error) throw error;
      setLastSynced(new Date().toISOString());
      queryClient.invalidateQueries();
      toast.success(`Synced ${data?.records_synced || 0} records`);
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
    <header className="flex items-center justify-between py-6">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {activeClient ? activeClient.name : "Performance Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground">Cross-channel marketing analytics</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ClientSwitcher />
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
        <DateRangePicker />
        <Link to="/settings">
          <Button variant="ghost" size="icon">
            <Settings className="w-5 h-5" />
          </Button>
        </Link>
      </div>
    </header>
  );
};

export default DashboardHeader;
