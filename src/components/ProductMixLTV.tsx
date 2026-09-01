import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KPICard from "@/components/KPICard";
import { Boxes, Gift, CreditCard, Info, Facebook, Chrome } from "lucide-react";
import {
  useSubblyPlanMix,
  useSubblyLTVSummary,
  useSubblyAttribution,
  useAdLTV,
  useKeywordLTV,
  type PlanKind,
  type PlanMixRow,
  type EntityLTVRow,
} from "@/hooks/useSubblyLTV";

const money = (n: number, digits = 0) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const kindLabel: Record<PlanKind, string> = { self_pay: "Self-Pay", gift: "Gift", other: "Other" };

const PlanTable = ({ rows, totalSubs }: { rows: PlanMixRow[]; totalSubs: number }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Product</TableHead>
        <TableHead className="text-right">Term</TableHead>
        <TableHead className="text-right">New Subs</TableHead>
        <TableHead className="text-right">Mix %</TableHead>
        <TableHead className="text-right">New Customers</TableHead>
        <TableHead className="text-right">Collected to Date</TableHead>
        <TableHead className="text-right">Collected / Sub</TableHead>
        <TableHead className="text-right">Projected LTV / Sub</TableHead>
        <TableHead className="text-right">Projected Cohort Value</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.length === 0 && (
        <TableRow>
          <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
            No new subscriptions in this date range.
          </TableCell>
        </TableRow>
      )}
      {rows.map((r) => (
        <TableRow key={r.planId}>
          <TableCell className="font-medium">
            <div className="flex items-center gap-2">
              {r.kind === "gift" ? <Gift className="w-3.5 h-3.5 text-muted-foreground" /> : <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />}
              {r.planName}
            </div>
          </TableCell>
          <TableCell className="text-right font-mono text-xs">{r.termMonths ? `${r.termMonths} mo` : "—"}</TableCell>
          <TableCell className="text-right font-mono font-semibold">{r.newSubs.toLocaleString()}</TableCell>
          <TableCell className="text-right font-mono text-xs text-muted-foreground">
            {totalSubs > 0 ? `${((r.newSubs / totalSubs) * 100).toFixed(1)}%` : "—"}
          </TableCell>
          <TableCell className="text-right font-mono">{r.newCustomerSubs.toLocaleString()}</TableCell>
          <TableCell className="text-right font-mono">{money(r.realizedRevenue)}</TableCell>
          <TableCell className="text-right font-mono">{money(r.realizedPerSub, 2)}</TableCell>
          <TableCell className="text-right font-mono text-primary">{money(r.projectedLtvPerSub, 2)}</TableCell>
          <TableCell className="text-right font-mono">{money(r.projectedRevenue)}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const EntityTable = ({
  rows,
  isLoading,
  entityLabel,
  hasRealAttribution,
}: {
  rows: EntityLTVRow[];
  isLoading: boolean;
  entityLabel: string;
  hasRealAttribution: boolean;
}) => {
  if (isLoading) return <Skeleton className="h-64 rounded-lg" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{entityLabel}</TableHead>
          <TableHead>Campaign</TableHead>
          <TableHead className="text-right">Spend</TableHead>
          <TableHead className="text-right">Conv.</TableHead>
          <TableHead className="text-right">CPA</TableHead>
          <TableHead className="text-right">Est. LTV Generated</TableHead>
          <TableHead className="text-right">Est. LTV : CAC</TableHead>
          {hasRealAttribution && <TableHead className="text-right">Tracked Subs</TableHead>}
          {hasRealAttribution && <TableHead className="text-right">Tracked Revenue</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={hasRealAttribution ? 9 : 7} className="text-center text-muted-foreground py-6">
              No spend in this date range.
            </TableCell>
          </TableRow>
        )}
        {rows.slice(0, 50).map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium max-w-[240px] truncate" title={r.name}>{r.name}</TableCell>
            <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={r.campaignName}>{r.campaignName}</TableCell>
            <TableCell className="text-right font-mono">{money(r.spend, 2)}</TableCell>
            <TableCell className="text-right font-mono">{r.conversions.toLocaleString()}</TableCell>
            <TableCell className="text-right font-mono">{r.conversions > 0 ? money(r.cpa, 2) : "—"}</TableCell>
            <TableCell className="text-right font-mono">{money(r.estimatedLtv, 0)}</TableCell>
            <TableCell className="text-right font-mono">
              <span className={r.ltvToCac >= 3 ? "text-accent font-semibold" : r.ltvToCac >= 1 ? "text-yellow-500" : "text-destructive"}>
                {r.ltvToCac.toFixed(2)}x
              </span>
            </TableCell>
            {hasRealAttribution && <TableCell className="text-right font-mono">{r.attributedSubs ?? "—"}</TableCell>}
            {hasRealAttribution && (
              <TableCell className="text-right font-mono">{r.attributedRealized !== null ? money(r.attributedRealized, 2) : "—"}</TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

const ProductMixLTV = () => {
  const { data: mix, isLoading: mixLoading } = useSubblyPlanMix();
  const { data: summary, isLoading: summaryLoading } = useSubblyLTVSummary();
  const { data: attribution } = useSubblyAttribution();
  const ltvPerSub = summary?.projectedLtvPerSub ?? 0;
  const { data: adRows, isLoading: adLoading } = useAdLTV(ltvPerSub, attribution);
  const { data: kwRows, isLoading: kwLoading } = useKeywordLTV(ltvPerSub, attribution);

  const rows = mix || [];
  const totalSubs = summary?.newSubs ?? 0;
  const selfPay = useMemo(() => rows.filter((r) => r.kind === "self_pay"), [rows]);
  const gift = useMemo(() => rows.filter((r) => r.kind === "gift"), [rows]);
  const other = useMemo(() => rows.filter((r) => r.kind === "other"), [rows]);
  const hasRealAttribution = attribution?.hasRealAttribution ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-tight">Product Mix &amp; Lifetime Value</h2>
          <p className="text-xs text-muted-foreground">
            New subscriptions by product, with revenue collected to date and projected lifetime value per subscriber
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {summaryLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KPICard title="New Subscriptions" value={(summary?.newSubs ?? 0).toLocaleString()} subtitle={`${summary?.newCustomerSubs ?? 0} brand-new customers`} />
            <KPICard title="Self-Pay" value={(summary?.selfPaySubs ?? 0).toLocaleString()} subtitle={totalSubs > 0 ? `${(((summary?.selfPaySubs ?? 0) / totalSubs) * 100).toFixed(0)}% of mix` : undefined} />
            <KPICard title="Gift" value={(summary?.giftSubs ?? 0).toLocaleString()} subtitle={totalSubs > 0 ? `${(((summary?.giftSubs ?? 0) / totalSubs) * 100).toFixed(0)}% of mix` : undefined} />
            <KPICard title="Collected to Date" value={money(summary?.realizedRevenue ?? 0)} subtitle="Cash from this cohort so far" />
            <KPICard title="Collected / Subscriber" value={money(summary?.realizedPerSub ?? 0, 2)} subtitle="Realized, to date" />
            <KPICard title="Projected LTV / Subscriber" value={money(ltvPerSub, 2)} subtitle={`Cohort value ${money(summary?.projectedRevenue ?? 0)}`} />
          </>
        )}
      </div>

      {/* Plan breakdown */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Products Sold — Self-Pay vs Gift by Term</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Projected LTV per subscriber is the lifetime revenue actually collected from mature subscribers (signed up 12+ months ago) on the same plan, falling back
            to equivalent legacy plans of the same type and term, then to list price. It never reads below what this cohort has already paid.
          </p>

        </CardHeader>
        <CardContent className="overflow-x-auto">
          {mixLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> {kindLabel.self_pay}
                </h3>
                <PlanTable rows={selfPay} totalSubs={totalSubs} />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5" /> {kindLabel.gift}
                </h3>
                <PlanTable rows={gift} totalSubs={totalSubs} />
              </div>
              {other.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{kindLabel.other}</h3>
                  <PlanTable rows={other} totalSubs={totalSubs} />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attribution status */}
      <Card className={hasRealAttribution ? "border-accent/40 bg-accent/5" : "border-yellow-500/40 bg-yellow-500/5"}>
        <CardContent className="py-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            {hasRealAttribution ? (
              <p>
                <strong className="text-foreground">Click-level tracking is live.</strong>{" "}
                {attribution?.attributedSubs} of {attribution?.totalSubsInRange} new subscriptions in this range carry an ad or keyword reference, shown in the
                &quot;Tracked&quot; columns below alongside the modeled estimate.
              </p>
            ) : (
              <p>
                <strong className="text-foreground">LTV per ad and keyword is modeled, not tracked.</strong> Subscriptions carry no ad or click reference yet, so
                per-ad LTV = platform-reported conversions × the blended projected LTV of {money(ltvPerSub, 2)}. Treat it as directional. Once the checkout passes
                UTMs and click IDs (fbclid / gclid) into the subscription record, the real per-subscriber values appear here automatically.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* LTV by ad / keyword */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">LTV by Creative &amp; Keyword</CardTitle>
            <Badge variant="outline" className="text-[10px]">{hasRealAttribution ? "Modeled + tracked" : "Modeled"}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Est. LTV : CAC above 3x means every dollar of media is projected to return three dollars of lifetime revenue.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="meta">
            <TabsList className="bg-secondary/50 mb-4">
              <TabsTrigger value="meta" className="gap-1.5">
                <Facebook className="w-3.5 h-3.5" /> Meta Ads
              </TabsTrigger>
              <TabsTrigger value="google" className="gap-1.5">
                <Chrome className="w-3.5 h-3.5" /> Google Keywords
              </TabsTrigger>
            </TabsList>
            <TabsContent value="meta" className="overflow-x-auto">
              <EntityTable rows={adRows || []} isLoading={adLoading} entityLabel="Ad" hasRealAttribution={hasRealAttribution} />
            </TabsContent>
            <TabsContent value="google" className="overflow-x-auto">
              <EntityTable rows={kwRows || []} isLoading={kwLoading} entityLabel="Keyword" hasRealAttribution={hasRealAttribution} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductMixLTV;
