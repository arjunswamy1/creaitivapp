import { BarChart3, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DateRangePicker from "@/components/DateRangePicker";
import AccountSelector from "@/components/AccountSelector";

const DashboardHeader = () => {
  const [lastSynced, setLastSynced] = useState<string | null>(null);

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
          <h1 className="text-xl font-bold tracking-tight">Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground">Cross-channel marketing analytics</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <AccountSelector />
        {lastSynced && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="font-mono">{formatRelativeTime(lastSynced)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Last synced: {new Date(lastSynced).toLocaleString()}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
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
