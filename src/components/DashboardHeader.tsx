import { BarChart3, Calendar, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const DashboardHeader = () => {
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
      <div className="flex items-center gap-2">
        <Button variant="outline" className="gap-2 text-sm">
          <Calendar className="w-4 h-4" />
          Feb 1 – Feb 14, 2025
        </Button>
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
