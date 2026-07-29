import { Package } from "lucide-react";
import KPICard from "@/components/KPICard";
import { useSubblyKPIs, useSubblyRevenueSplit } from "@/hooks/useSubblyData";
import { Skeleton } from "@/components/ui/skeleton";

const SubblyKPIRow = () => {
  const { data, isLoading, isError } = useSubblyKPIs();
  const { data: split, isLoading: splitLoading } = useSubblyRevenueSplit();

  if (isError || (!isLoading && !data)) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Package className="w-4 h-4" /> Subscription Metrics
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)

        ) : (
          <>
            <KPICard
              title="New Subscriptions"
              value={(data?.newSubscriptions ?? 0).toLocaleString()}
            />
            <KPICard
              title="Active Subscriptions"
              value={(data?.activeSubscriptions ?? 0).toLocaleString()}
            />
            <KPICard
              title="Est. MRR"
              value={`$${(data?.mrr ?? 0).toLocaleString()}`}
            />
            <KPICard
              title="Total Revenue"
              value={`$${(data?.totalRevenue ?? 0).toLocaleString()}`}
            />
            <KPICard
              title="Churn Rate"
              value={`${data?.churnRate ?? 0}%`}
              invertColor
            />
          </>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
        {splitLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard
              title="New Subscription Revenue"
              value={`$${(split?.newRevenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              subtitle={`${split?.newInvoices ?? 0} first-time orders`}
            />
            <KPICard
              title="Renewal Revenue"
              value={`$${(split?.renewalRevenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              subtitle={`${split?.renewalInvoices ?? 0} renewals`}
            />
            <KPICard
              title="% Revenue from New Subs"
              value={`${(() => {
                const total = (split?.newRevenue ?? 0) + (split?.renewalRevenue ?? 0);
                return total > 0 ? Math.round(((split?.newRevenue ?? 0) / total) * 1000) / 10 : 0;
              })()}%`}
            />
          </>
        )}
      </div>
    </div>
  );
};


export default SubblyKPIRow;
