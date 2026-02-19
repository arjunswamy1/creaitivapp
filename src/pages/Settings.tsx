import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Bell,
  Save,
  SendHorizonal,
  Hash,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";

interface PlatformConnection {
  platform: string;
  account_name: string | null;
  connected_at: string;
}

interface PlatformCardProps {
  name: string;
  platformKey: string;
  description: string;
  connection: PlatformConnection | undefined;
  gradientClass: string;
  glowClass: string;
  onConnect: () => void;
  onDisconnect: () => void;
  connecting: boolean;
  disconnecting: boolean;
}

const PlatformCard = ({
  name,
  connection,
  description,
  gradientClass,
  glowClass,
  onConnect,
  onDisconnect,
  connecting,
  disconnecting,
}: PlatformCardProps) => (
  <div className="glass-card p-6 flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg ${gradientClass} flex items-center justify-center ${glowClass}`}>
        <span className="text-sm font-bold text-white">{name.charAt(0)}</span>
      </div>
      <div>
        <h3 className="font-semibold text-sm">{name}</h3>
        <p className="text-xs text-muted-foreground">
          {connection ? `Connected as ${connection.account_name || "Unknown"}` : description}
        </p>
      </div>
    </div>
    {connection ? (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-accent text-sm font-medium">
          <CheckCircle2 className="w-4 h-4" />
          Connected
        </div>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive gap-1 text-xs" onClick={onDisconnect} disabled={disconnecting}>
          {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Disconnect
        </Button>
      </div>
    ) : (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={onConnect} disabled={connecting}>
        {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (<>Connect<ExternalLink className="w-3.5 h-3.5" /></>)}
      </Button>
    )}
  </div>
);

const Settings = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Alert settings state
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [maxCac, setMaxCac] = useState("");
  const [minRoas, setMinRoas] = useState("");
  const [slackChannel, setSlackChannel] = useState("");
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [slackChannels, setSlackChannels] = useState<{ id: string; name: string }[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [shopifyDialogOpen, setShopifyDialogOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  useEffect(() => {
    const fetchData = async () => {
      const [connRes, alertRes] = await Promise.all([
        supabase.from("platform_connections").select("platform, account_name, connected_at"),
        supabase.from("alert_settings").select("*").maybeSingle(),
      ]);

      if (connRes.data) setConnections(connRes.data);
      if (alertRes.data) {
        setAlertEnabled(alertRes.data.enabled);
        setMaxCac(alertRes.data.max_cac?.toString() || "");
        setMinRoas(alertRes.data.min_roas?.toString() || "");
        setSlackChannel(alertRes.data.slack_channel || "");
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // Fetch Slack channels
  useEffect(() => {
    const fetchChannels = async () => {
      setLoadingChannels(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await supabase.functions.invoke("slack-channels", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.data?.channels) {
          setSlackChannels(res.data.channels);
        }
      } catch (err) {
        console.error("Failed to fetch Slack channels:", err);
      } finally {
        setLoadingChannels(false);
      }
    };
    fetchChannels();
  }, []);

  const handleTestSlack = async () => {
    if (!slackChannel) {
      toast({ title: "No channel selected", description: "Select a Slack channel first.", variant: "destructive" });
      return;
    }
    setTestingSlack(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await supabase.functions.invoke("slack-channels", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "test", channel: slackChannel },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: "Test sent!", description: "Check your Slack channel for the test message." });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message || "Could not send test message", variant: "destructive" });
    } finally {
      setTestingSlack(false);
    }
  };

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected) {
      toast({ title: "Connected!", description: `${connected.charAt(0).toUpperCase() + connected.slice(1)} account connected successfully.` });
      supabase.from("platform_connections").select("platform, account_name, connected_at").then(({ data }) => { if (data) setConnections(data); });
      setSearchParams({}, { replace: true });
    }
    if (error) {
      toast({ title: "Connection failed", description: decodeURIComponent(error), variant: "destructive" });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const handleConnectMeta = async () => {
    setConnecting("meta");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await supabase.functions.invoke("meta-oauth-initiate", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.error) throw res.error;
      if (res.data?.url) window.open(res.data.url, "_self");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to start Meta connection", variant: "destructive" });
      setConnecting(null);
    }
  };

  const handleConnectGoogle = async () => {
    setConnecting("google");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await supabase.functions.invoke("google-oauth-initiate", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.error) throw res.error;
      if (res.data?.url) window.open(res.data.url, "_self");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to start Google connection", variant: "destructive" });
      setConnecting(null);
    }
  };

  const handleConnectShopify = async () => {
    if (!shopDomain.trim()) {
      toast({ title: "Error", description: "Please enter your Shopify store domain", variant: "destructive" });
      return;
    }
    setConnecting("shopify");
    setShopifyDialogOpen(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      let domain = shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "");
      // If user entered a custom domain (e.g. phantasmagorical.co), they need to provide the myshopify.com domain
      // If it already contains .myshopify.com, use as-is; otherwise append it
      const fullDomain = domain.includes(".myshopify.com") ? domain : `${domain}.myshopify.com`;
      const res = await supabase.functions.invoke("shopify-oauth-initiate", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { shop: fullDomain },
      });
      if (res.error) throw res.error;
      if (res.data?.url) window.open(res.data.url, "_self");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to start Shopify connection", variant: "destructive" });
      setConnecting(null);
    }
  };

  const handleSaveAlerts = async () => {
    setSavingAlerts(true);
    try {
      const payload = {
        user_id: user!.id,
        enabled: alertEnabled,
        max_cac: maxCac ? parseFloat(maxCac) : null,
        min_roas: minRoas ? parseFloat(minRoas) : null,
        slack_channel: slackChannel || null,
      };

      const { error } = await supabase.from("alert_settings").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      toast({ title: "Saved", description: "Alert settings updated successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingAlerts(false);
    }
  };

  const handleDisconnect = async (platform: string) => {
    setDisconnecting(platform);
    try {
      const { error } = await supabase.from("platform_connections").delete().eq("platform", platform);
      if (error) throw error;
      setConnections((prev) => prev.filter((c) => c.platform !== platform));
      toast({ title: "Disconnected", description: `${platform.charAt(0).toUpperCase() + platform.slice(1)} account disconnected.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to disconnect", variant: "destructive" });
    } finally {
      setDisconnecting(null);
    }
  };

  const getConnection = (platform: string) => connections.find((c) => c.platform === platform);

  return (
    <div className="min-h-screen bg-background px-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-4">
            <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Settings</h1>
              <p className="text-sm text-muted-foreground">Manage your account &amp; connections</p>
            </div>
          </div>
        </header>

        {/* Account */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Account</h2>
          <div className="glass-card p-6 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{user?.email}</p>
              <p className="text-xs text-muted-foreground">Signed in since {new Date(user?.created_at ?? "").toLocaleDateString()}</p>
            </div>
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={signOut}>
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </Button>
          </div>
        </section>

        {/* Platform connections */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Platform Connections</h2>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3">
              <PlatformCard name="Meta Ads" platformKey="meta" description="Connect your Facebook & Instagram ad accounts" connection={getConnection("meta")} gradientClass="platform-meta" glowClass="glow-meta" onConnect={handleConnectMeta} onDisconnect={() => handleDisconnect("meta")} connecting={connecting === "meta"} disconnecting={disconnecting === "meta"} />
              <PlatformCard name="Google Ads" platformKey="google" description="Connect your Google Ads manager account" connection={getConnection("google")} gradientClass="platform-google" glowClass="glow-google" onConnect={handleConnectGoogle} onDisconnect={() => handleDisconnect("google")} connecting={connecting === "google"} disconnecting={disconnecting === "google"} />
              <PlatformCard name="Shopify" platformKey="shopify" description="Connect your Shopify store for revenue data" connection={getConnection("shopify")} gradientClass="platform-shopify" glowClass="glow-shopify" onConnect={() => setShopifyDialogOpen(true)} onDisconnect={() => handleDisconnect("shopify")} connecting={connecting === "shopify"} disconnecting={disconnecting === "shopify"} />
            </div>
          )}
        </section>

        {/* Alert Settings */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4" /> Performance Alerts
          </h2>
          <div className="glass-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Enable Alerts</p>
                <p className="text-xs text-muted-foreground">Get notified when campaigns breach your targets</p>
              </div>
              <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-cac" className="text-xs">Max CAC (Cost per Acquisition)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="max-cac"
                    type="number"
                    placeholder="50.00"
                    value={maxCac}
                    onChange={(e) => setMaxCac(e.target.value)}
                    className="pl-7"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Alert when any campaign's CAC exceeds this</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="min-roas" className="text-xs">Min ROAS Target</Label>
                <div className="relative">
                  <Input
                    id="min-roas"
                    type="number"
                    placeholder="2.0"
                    value={minRoas}
                    onChange={(e) => setMinRoas(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">x</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Alert when any campaign's ROAS drops below this</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Hash className="w-3 h-3" /> Slack Channel
              </Label>
              {loadingChannels ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading channels...
                </div>
              ) : slackChannels.length > 0 ? (
                <Select value={slackChannel} onValueChange={setSlackChannel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {slackChannels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        #{ch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="C0123456789"
                  value={slackChannel}
                  onChange={(e) => setSlackChannel(e.target.value)}
                />
              )}
              <p className="text-[10px] text-muted-foreground">Alerts will be posted to this channel.</p>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleSaveAlerts} disabled={savingAlerts} size="sm" className="gap-1.5">
                {savingAlerts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Alert Settings
              </Button>
              <Button
                onClick={handleTestSlack}
                disabled={testingSlack || !slackChannel}
                size="sm"
                variant="outline"
                className="gap-1.5"
              >
                {testingSlack ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendHorizonal className="w-3.5 h-3.5" />}
                Test Alert
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Shopify Domain Dialog */}
      <Dialog open={shopifyDialogOpen} onOpenChange={setShopifyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Shopify Store</DialogTitle>
            <DialogDescription>
              Enter your Shopify store's <strong>.myshopify.com</strong> domain (e.g. your-store.myshopify.com). This is not your custom domain.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="shop-domain" className="text-xs">Store Domain</Label>
            <Input
              id="shop-domain"
              placeholder="your-store.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnectShopify()}
            />
            <p className="text-[10px] text-muted-foreground">Enter your myshopify.com domain, not a custom domain like yourstore.com.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShopifyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConnectShopify} disabled={!shopDomain.trim()}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

};

export default Settings;
