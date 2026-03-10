import { useBillyKPIs } from "@/hooks/useBillyKPIs";
import { useRingbaData } from "@/hooks/useRingbaData";
import { useFlightsForecast } from "@/hooks/useFlightsForecast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Rec {
  icon: React.ReactNode;
  title: string;
  detail: string;
  type: "success" | "warning" | "danger" | "info";
}

const FlightsRecommendations = () => {
  const { data: kpis } = useBillyKPIs();
  const { data: ringba } = useRingbaData();
  const { data: fc } = useFlightsForecast();

  if (!kpis || !ringba) return null;

  const recs: Rec[] = [];

  const totalClicks = kpis.impressions ? Math.round((kpis.ctr / 100) * kpis.impressions) : 0;
  const rpv = totalClicks > 0 ? ringba.totalRevenue / totalClicks : 0;
  const cpc = Number(kpis.cpc) || 0;
  const lpCvr = totalClicks > 0 ? (ringba.totalCalls / totalClicks) * 100 : 0;
  const callROAS = kpis.totalSpend > 0 ? ringba.totalRevenue / kpis.totalSpend : 0;
  const costPerCall = ringba.totalCalls > 0 ? kpis.totalSpend / ringba.totalCalls : 0;

  // RPV vs CPC
  if (rpv > cpc * 1.5) {
    recs.push({
      icon: <TrendingUp className="w-4 h-4" />,
      title: "Strong RPV margin — scale aggressively",
      detail: `RPV ($${rpv.toFixed(2)}) is ${((rpv / cpc - 1) * 100).toFixed(0)}% above CPC ($${cpc.toFixed(2)}). You have significant headroom to increase daily budgets while remaining profitable.`,
      type: "success",
    });
  } else if (rpv > cpc) {
    recs.push({
      icon: <CheckCircle2 className="w-4 h-4" />,
      title: "Positive RPV margin — scale cautiously",
      detail: `RPV ($${rpv.toFixed(2)}) is above CPC ($${cpc.toFixed(2)}) but the margin is thin. Consider optimizing LP CVR or call conversion before increasing spend.`,
      type: "info",
    });
  } else {
    recs.push({
      icon: <AlertTriangle className="w-4 h-4" />,
      title: "RPV below CPC — pause scaling",
      detail: `RPV ($${rpv.toFixed(2)}) is below CPC ($${cpc.toFixed(2)}). Every visitor costs more than they generate. Focus on improving LP CVR (currently ${lpCvr.toFixed(1)}%) or negotiating higher payouts.`,
      type: "danger",
    });
  }

  // LP CVR
  if (lpCvr < 3) {
    recs.push({
      icon: <TrendingDown className="w-4 h-4" />,
      title: "Low LP CVR — test landing page changes",
      detail: `Only ${lpCvr.toFixed(1)}% of visitors are calling. Test stronger CTAs, above-the-fold phone placement, or urgency copy to push CVR above 4%.`,
      type: "warning",
    });
  } else if (lpCvr >= 5) {
    recs.push({
      icon: <CheckCircle2 className="w-4 h-4" />,
      title: "Strong LP CVR",
      detail: `LP CVR at ${lpCvr.toFixed(1)}% is healthy. Maintain current landing page and focus optimization efforts elsewhere.`,
      type: "success",
    });
  }

  // Connect rate
  if (ringba.connectRate < 50) {
    recs.push({
      icon: <AlertTriangle className="w-4 h-4" />,
      title: "Low connect rate — check call routing",
      detail: `Only ${ringba.connectRate.toFixed(0)}% of calls are connecting. Review IVR flow, hold times, and buyer availability windows.`,
      type: "danger",
    });
  }

  // Call ROAS
  if (callROAS > 2) {
    recs.push({
      icon: <TrendingUp className="w-4 h-4" />,
      title: `${callROAS.toFixed(1)}x ROAS — excellent performance`,
      detail: `For every $1 in ad spend you're generating $${callROAS.toFixed(2)} in call revenue. Consider increasing daily budget by 15-20% and monitoring for 3 days.`,
      type: "success",
    });
  } else if (callROAS < 1) {
    recs.push({
      icon: <AlertTriangle className="w-4 h-4" />,
      title: "Below break-even ROAS",
      detail: `Call ROAS is ${callROAS.toFixed(2)}x (below 1.0). You're losing $${(kpis.totalSpend - ringba.totalRevenue).toFixed(0)} over this period. Kill underperforming ad sets or reduce spend until unit economics improve.`,
      type: "danger",
    });
  }

  // Forecast-based
  if (fc) {
    if (fc.projectedProfit < 0) {
      recs.push({
        icon: <TrendingDown className="w-4 h-4" />,
        title: "Month projected negative",
        detail: `At current pace, this month will end at -$${Math.abs(Math.round(fc.projectedProfit)).toLocaleString()}. Either reduce daily spend or improve conversion metrics to flip to positive.`,
        type: "danger",
      });
    } else if (fc.projectedProfit > 0 && fc.daysRemaining > 5) {
      recs.push({
        icon: <CheckCircle2 className="w-4 h-4" />,
        title: `On track for +$${Math.round(fc.projectedProfit).toLocaleString()} profit this month`,
        detail: `${fc.daysRemaining} days remaining. Projected ROAS: ${fc.projectedROAS.toFixed(2)}x. Stay the course and monitor daily trends.`,
        type: "success",
      });
    }
  }

  if (recs.length === 0) return null;

  const typeStyles: Record<string, string> = {
    success: "border-l-accent bg-accent/5",
    warning: "border-l-yellow-500 bg-yellow-500/5",
    danger: "border-l-destructive bg-destructive/5",
    info: "border-l-primary bg-primary/5",
  };

  const iconStyles: Record<string, string> = {
    success: "text-accent",
    warning: "text-yellow-500",
    danger: "text-destructive",
    info: "text-primary",
  };

  return (
    <Card className="mt-6 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Recommendations</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">Auto-generated insights based on your funnel data and goals</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {recs.map((rec, i) => (
          <div key={i} className={`border-l-4 rounded-r-lg p-4 ${typeStyles[rec.type]}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 ${iconStyles[rec.type]}`}>{rec.icon}</span>
              <div>
                <p className="text-sm font-semibold">{rec.title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{rec.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default FlightsRecommendations;
