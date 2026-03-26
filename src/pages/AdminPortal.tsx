import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, LogIn, Calendar, TrendingUp } from "lucide-react";
import { format, subDays, isAfter } from "date-fns";

const ADMIN_EMAILS = ["aj@creaitivapp.com", "charles@connectpaidmedia.com"];

interface LoginEvent {
  user_id: string;
  email: string;
  logged_in_at: string;
}

interface UserLoginSummary {
  email: string;
  totalLogins: number;
  last7Days: number;
  last30Days: number;
  lastLogin: string;
  clientNames: string[];
}

const AdminPortal = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState<UserLoginSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }
    fetchLoginData();
  }, [user, authLoading]);

  const fetchLoginData = async () => {
    try {
      // Fetch login events
      const { data: events, error } = await supabase
        .from("login_events" as any)
        .select("user_id, email, logged_in_at")
        .order("logged_in_at", { ascending: false });

      if (error) throw error;

      // Fetch client memberships to show which client each user belongs to
      const { data: members } = await supabase
        .from("client_members")
        .select("user_id, client_id, clients(name)") as any;

      const memberMap = new Map<string, string[]>();
      for (const m of members || []) {
        const uid = m.user_id;
        const clientName = m.clients?.name || "Unknown";
        if (!memberMap.has(uid)) memberMap.set(uid, []);
        const arr = memberMap.get(uid)!;
        if (!arr.includes(clientName)) arr.push(clientName);
      }

      // Aggregate by email
      const now = new Date();
      const sevenDaysAgo = subDays(now, 7);
      const thirtyDaysAgo = subDays(now, 30);

      const byEmail = new Map<string, { events: LoginEvent[]; userId: string }>();
      for (const evt of (events || []) as LoginEvent[]) {
        if (!evt.email) continue;
        if (!byEmail.has(evt.email)) {
          byEmail.set(evt.email, { events: [], userId: evt.user_id });
        }
        byEmail.get(evt.email)!.events.push(evt);
      }

      const results: UserLoginSummary[] = Array.from(byEmail.entries()).map(([email, { events, userId }]) => {
        const last7 = events.filter(e => isAfter(new Date(e.logged_in_at), sevenDaysAgo)).length;
        const last30 = events.filter(e => isAfter(new Date(e.logged_in_at), thirtyDaysAgo)).length;
        return {
          email,
          totalLogins: events.length,
          last7Days: last7,
          last30Days: last30,
          lastLogin: events[0]?.logged_in_at || "",
          clientNames: memberMap.get(userId) || [],
        };
      });

      // Sort by last login descending
      results.sort((a, b) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime());
      setSummaries(results);
    } catch (err) {
      console.error("Admin portal error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">You don't have permission to view this page.</p>
            <button onClick={() => navigate("/")} className="text-primary underline">
              Back to Dashboard
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Exclude admin emails from the list — we only want to see client logins
  const clientSummaries = summaries.filter(s => !ADMIN_EMAILS.includes(s.email));
  const totalUniqueUsers = clientSummaries.length;
  const totalLoginsLast7 = clientSummaries.reduce((s, u) => s + u.last7Days, 0);
  const totalLoginsLast30 = clientSummaries.reduce((s, u) => s + u.last30Days, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Admin Portal</h1>
            <p className="text-muted-foreground text-sm">Client login activity overview</p>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Client Users</p>
                <p className="text-2xl font-bold">{totalUniqueUsers}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent/10">
                <TrendingUp className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Logins (Last 7 Days)</p>
                <p className="text-2xl font-bold">{totalLoginsLast7}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-secondary">
                <Calendar className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Logins (Last 30 Days)</p>
                <p className="text-2xl font-bold">{totalLoginsLast30}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* User Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LogIn className="w-5 h-5" />
              Client Login Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientSummaries.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No client login data recorded yet. Data will appear after clients log in.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 text-muted-foreground font-medium">Email</th>
                      <th className="text-left py-3 text-muted-foreground font-medium">Client(s)</th>
                      <th className="text-right py-3 text-muted-foreground font-medium">Last 7 Days</th>
                      <th className="text-right py-3 text-muted-foreground font-medium">Last 30 Days</th>
                      <th className="text-right py-3 text-muted-foreground font-medium">Total Logins</th>
                      <th className="text-right py-3 text-muted-foreground font-medium">Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientSummaries.map((u) => (
                      <tr key={u.email} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                        <td className="py-3 font-medium">{u.email}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {u.clientNames.length > 0 ? u.clientNames.map(cn => (
                              <Badge key={cn} variant="outline" className="text-xs">{cn}</Badge>
                            )) : <span className="text-muted-foreground text-xs">—</span>}
                          </div>
                        </td>
                        <td className="py-3 text-right font-mono">
                          <span className={u.last7Days > 0 ? "text-accent font-semibold" : "text-muted-foreground"}>
                            {u.last7Days}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono">{u.last30Days}</td>
                        <td className="py-3 text-right font-mono">{u.totalLogins}</td>
                        <td className="py-3 text-right text-xs text-muted-foreground">
                          {u.lastLogin ? format(new Date(u.lastLogin), "MMM d, yyyy h:mm a") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPortal;
