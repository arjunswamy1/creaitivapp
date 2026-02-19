import { useState, useMemo, useEffect } from "react";
import { useBudgetPlanner, useBudgetBaseline, CampaignBudget } from "@/hooks/useBudgetPlanner";
import { useClient } from "@/contexts/ClientContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Target, DollarSign, Sparkles, TrendingUp, TrendingDown,
  Users, BarChart3, Settings, ArrowLeft, Chrome, Facebook,
  CalendarDays,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import DashboardHeader from "@/components/DashboardHeader";
import { DateRangeProvider } from "@/contexts/DateRangeContext";

function BudgetPlannerContent() {
  const { activeClient } = useClient();
  const [goalInput, setGoalInput] = useState("");
  const [submittedGoal, setSubmittedGoal] = useState<number | null>(null);
  const [editedBudgets, setEditedBudgets] = useState<Record<string, number>>({});

  const { data: baseline, isLoading: baselineLoading } = useBudgetBaseline(activeClient?.id);
  const { data: plan, isLoading, error } = useBudgetPlanner(submittedGoal, activeClient?.id);

  useEffect(() => {
    if (baseline?.last_year_baseline?.suggested_goal && !goalInput && !submittedGoal) {
      setGoalInput(baseline.last_year_baseline.suggested_goal.toString());
    }
  }, [baseline]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(goalInput);
    if (val > 0) {
      setSubmittedGoal(val);
      setEditedBudgets({});
    }
  };

  const campaignBudgets = useMemo(() => {
    if (!plan) return [];
    return plan.campaign_budgets.map((c) => {
      const key = `${c.platform}::${c.platform_campaign_id}`;
      const editedDaily = editedBudgets[key];
      if (editedDaily !== undefined) {
        return { ...c, daily_budget: editedDaily, monthly_budget: Math.round(editedDaily * plan.days_in_month) };
      }
      return c;
    });
  }, [plan, editedBudgets]);

  const editedTotalBudget = useMemo(() => {
    return campaignBudgets.reduce((s, c) => s + c.monthly_budget, 0);
  }, [campaignBudgets]);

  const handleDailyBudgetChange = (key: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      setEditedBudgets((prev) => ({ ...prev, [key]: Math.round(num * 100) / 100 }));
    }
  };

  const platformIcon = (p: string) =>
    p === "google" ? <Chrome className="w-3.5 h-3.5" /> : <Facebook className="w-3.5 h-3.5" />;

  const platformColor = (p: string) =>
    p === "google" ? "text-amber-400" : "text-blue-400";

  const bl = baseline?.last_year_baseline || plan?.last_year_baseline;

  return (
    <div className="min-h-screen bg-background px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        <DashboardHeader />

        <div className="flex items-center gap-4 mb-6">
          <Link to="/">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Target className="w-6 h-6 text-primary" />
              Budget Planner
            </h2>
            <p className="text-sm text-muted-foreground">
              Plan {baseline?.target_month || "next month"} budgets based on your subscriber growth goals
            </p>
          </div>
        </div>

        {/* Last year baseline card */}
        {(bl || baselineLoading) && (
          <div className="glass-card p-5 mb-6">
            {baselineLoading && !bl ? (
              <Skeleton className="h-16 rounded-lg" />
            ) : bl ? (
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground">Last year baseline:</span>
                  <span className="font-bold font-mono">{bl.new_subscribers.toLocaleString()}</span>
                  <span className="text-muted-foreground">new subscribers in {bl.month}</span>
                </div>
                <div className="h-5 w-px bg-border hidden md:block" />
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-muted-foreground">25% growth target:</span>
                  <span className="font-bold font-mono text-primary">{bl.suggested_goal.toLocaleString()}</span>
                  <span className="text-muted-foreground">subscribers</span>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Goal input */}
        <div className="glass-card p-6 mb-6">
          <form onSubmit={handleSubmit} className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                New Subscriber Goal for {baseline?.target_month || "next month"}
              </label>
              <Input
                type="number"
                min={1}
                placeholder={bl ? `e.g. ${bl.suggested_goal}` : "e.g. 200"}
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className="font-mono text-lg"
              />
            </div>
            <Button type="submit" disabled={!goalInput || parseInt(goalInput) <= 0}>
              <Target className="w-4 h-4 mr-2" />
              Generate Budget Plan
            </Button>
          </form>
        </div>

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-[200px] rounded-xl" />
            <Skeleton className="h-[400px] rounded-xl" />
          </div>
        )}

        {error && (
          <div className="glass-card p-6">
            <p className="text-sm text-muted-foreground">
              Could not generate budget plan. Make sure you have at least 30 days of ad and subscription data synced.
            </p>
          </div>
        )}

        {plan && !isLoading && (
          <div className="space-y-6">
            {/* Overview cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard
                icon={<Users className="w-4 h-4" />}
                label="Subscriber Goal"
                value={plan.target_subs.toLocaleString()}
                sublabel={plan.target_month}
              />
              <StatCard
                icon={<DollarSign className="w-4 h-4" />}
                label="Recommended Budget"
                value={`$${editedTotalBudget.toLocaleString()}`}
                sublabel={`$${Math.round(editedTotalBudget / plan.days_in_month)}/day`}
                highlight
              />
              <StatCard
                icon={<TrendingUp className="w-4 h-4" />}
                label="Projected CAC"
                value={`$${plan.projection_cac}`}
                sublabel="Based on recent 30d"
              />
              <StatCard
                icon={<BarChart3 className="w-4 h-4" />}
                label="90-Day CAC"
                value={`$${plan.blended_90d_cac}`}
                sublabel={`${plan.cac_trend_pct > 0 ? "+" : ""}${plan.cac_trend_pct}% trend`}
              />
              <StatCard
                icon={<Settings className="w-4 h-4" />}
                label="Active Campaigns"
                value={plan.lookback_stats.active_campaigns.toString()}
                sublabel={`${plan.days_in_month} days in month`}
              />
            </div>

            {/* Platform split */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Platform Budget Split
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plan.platform_budgets.map((pb) => (
                  <div key={pb.platform} className="bg-secondary/40 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`flex items-center gap-2 font-semibold ${platformColor(pb.platform)}`}>
                        {platformIcon(pb.platform)}
                        {pb.platform === "google" ? "Google Ads" : "Meta Ads"}
                      </div>
                      <span className="text-xs bg-secondary px-2 py-1 rounded-full">
                        {pb.split_pct}% of budget
                      </span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-2xl font-bold font-mono">${pb.monthly_budget.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">${pb.daily_budget}/day</p>
                      </div>
                      <Progress value={pb.split_pct} className="w-24 h-2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Campaign-level breakdown */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Campaign Daily Budgets
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Edit daily budgets to adjust allocations. Monthly totals update automatically.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Platform</th>
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Campaign</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Daily Budget</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Monthly Budget</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Share</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Hist. CAC</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">ROAS</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">30d Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignBudgets.map((c) => {
                      const key = `${c.platform}::${c.platform_campaign_id}`;
                      return (
                        <tr key={key} className="border-b border-border/20 hover:bg-secondary/20 transition-colors">
                          <td className="py-2.5 px-3">
                            <span className={`flex items-center gap-1.5 ${platformColor(c.platform)}`}>
                              {platformIcon(c.platform)}
                              <span className="text-xs capitalize">{c.platform}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium max-w-[220px] truncate" title={c.campaign_name}>
                            {c.campaign_name}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={editedBudgets[key] ?? c.daily_budget}
                              onChange={(e) => handleDailyBudgetChange(key, e.target.value)}
                              className="w-24 ml-auto text-right font-mono text-sm h-8"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            ${c.monthly_budget.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">
                            {c.share_pct}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {c.historical_cac !== null ? `$${c.historical_cac}` : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {c.historical_roas}x
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                            ${c.recent_30d_spend.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border">
                      <td colSpan={2} className="py-2.5 px-3 font-semibold">Total</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        ${Math.round(editedTotalBudget / plan.days_in_month).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        ${editedTotalBudget.toLocaleString()}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* AI Insight */}
            {plan.ai_insight && (
              <div className="glass-card p-6">
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Budget Strategy Insight
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{plan.ai_insight}</p>
                </div>
              </div>
            )}

            {/* Lookback stats */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Analysis Based On</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Last Year ({plan.last_year_baseline.month})</p>
                  <p className="font-mono font-bold">{plan.last_year_baseline.new_subscribers.toLocaleString()} subs</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">90-Day Total Spend</p>
                  <p className="font-mono font-bold">${plan.lookback_stats.total_spend_90d.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">90-Day Total Subs</p>
                  <p className="font-mono font-bold">{plan.lookback_stats.total_subs_90d.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">30-Day Total Spend</p>
                  <p className="font-mono font-bold">${plan.lookback_stats.total_spend_30d.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">30-Day Total Subs</p>
                  <p className="font-mono font-bold">{plan.lookback_stats.total_subs_30d.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sublabel, highlight }: {
  icon: React.ReactNode; label: string; value: string; sublabel?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-primary/10 border border-primary/20" : "bg-secondary/40"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-lg font-bold font-mono ${highlight ? "text-primary" : ""}`}>{value}</p>
      {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
    </div>
  );
}

const BudgetPlanner = () => (
  <DateRangeProvider>
    <BudgetPlannerContent />
  </DateRangeProvider>
);

export default BudgetPlanner;
