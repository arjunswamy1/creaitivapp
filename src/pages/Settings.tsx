import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
  CheckCircle2,
  ArrowLeft,
  Loader2,
} from "lucide-react";
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
  connecting: boolean;
}

const PlatformCard = ({
  name,
  connection,
  description,
  gradientClass,
  glowClass,
  onConnect,
  connecting,
}: PlatformCardProps) => (
  <div className="glass-card p-6 flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div
        className={`w-10 h-10 rounded-lg ${gradientClass} flex items-center justify-center ${glowClass}`}
      >
        <span className="text-sm font-bold text-white">{name.charAt(0)}</span>
      </div>
      <div>
        <h3 className="font-semibold text-sm">{name}</h3>
        <p className="text-xs text-muted-foreground">
          {connection
            ? `Connected as ${connection.account_name || "Unknown"}`
            : description}
        </p>
      </div>
    </div>
    {connection ? (
      <div className="flex items-center gap-2 text-accent text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" />
        Connected
      </div>
    ) : (
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={onConnect}
        disabled={connecting}
      >
        {connecting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <>
            Connect
            <ExternalLink className="w-3.5 h-3.5" />
          </>
        )}
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

  // Fetch existing connections
  useEffect(() => {
    const fetchConnections = async () => {
      const { data, error } = await supabase
        .from("platform_connections")
        .select("platform, account_name, connected_at");

      if (!error && data) {
        setConnections(data);
      }
      setLoading(false);
    };
    fetchConnections();
  }, []);

  // Handle redirect params
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected) {
      toast({
        title: "Connected!",
        description: `${connected.charAt(0).toUpperCase() + connected.slice(1)} account connected successfully.`,
      });
      // Refresh connections
      supabase
        .from("platform_connections")
        .select("platform, account_name, connected_at")
        .then(({ data }) => {
          if (data) setConnections(data);
        });
      setSearchParams({}, { replace: true });
    }
    if (error) {
      toast({
        title: "Connection failed",
        description: decodeURIComponent(error),
        variant: "destructive",
      });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const handleConnectMeta = async () => {
    setConnecting("meta");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("meta-oauth-initiate", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      if (res.data?.url) {
        window.open(res.data.url, "_self");
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to start Meta connection",
        variant: "destructive",
      });
      setConnecting(null);
    }
  };

  const handleConnectGoogle = async () => {
    setConnecting("google");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("google-oauth-initiate", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      if (res.data?.url) {
        window.open(res.data.url, "_self");
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to start Google connection",
        variant: "destructive",
      });
      setConnecting(null);
    }
  };

  const handleConnectPlaceholder = (platform: string) => {
    toast({
      title: "Coming soon",
      description: `${platform} OAuth integration will be connected shortly.`,
    });
  };

  const getConnection = (platform: string) =>
    connections.find((c) => c.platform === platform);

  return (
    <div className="min-h-screen bg-background px-6 pb-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Manage your account &amp; connections
              </p>
            </div>
          </div>
        </header>

        {/* Account */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Account
          </h2>
          <div className="glass-card p-6 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{user?.email}</p>
              <p className="text-xs text-muted-foreground">
                Signed in since{" "}
                {new Date(user?.created_at ?? "").toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={signOut}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </Button>
          </div>
        </section>

        {/* Platform connections */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Platform Connections
          </h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              <PlatformCard
                name="Meta Ads"
                platformKey="meta"
                description="Connect your Facebook & Instagram ad accounts"
                connection={getConnection("meta")}
                gradientClass="platform-meta"
                glowClass="glow-meta"
                onConnect={handleConnectMeta}
                connecting={connecting === "meta"}
              />
              <PlatformCard
                name="Google Ads"
                platformKey="google"
                description="Connect your Google Ads manager account"
                connection={getConnection("google")}
                gradientClass="platform-google"
                glowClass="glow-google"
                onConnect={handleConnectGoogle}
                connecting={connecting === "google"}
              />
              <PlatformCard
                name="Shopify"
                platformKey="shopify"
                description="Connect your Shopify store for revenue data"
                connection={getConnection("shopify")}
                gradientClass="platform-shopify"
                glowClass="glow-shopify"
                onConnect={() => handleConnectPlaceholder("Shopify")}
                connecting={connecting === "shopify"}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Settings;
