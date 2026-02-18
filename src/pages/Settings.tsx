import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";

interface PlatformCardProps {
  name: string;
  description: string;
  connected: boolean;
  gradientClass: string;
  glowClass: string;
  onConnect: () => void;
}

const PlatformCard = ({
  name,
  description,
  connected,
  gradientClass,
  glowClass,
  onConnect,
}: PlatformCardProps) => (
  <div className="glass-card p-6 flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div
        className={`w-10 h-10 rounded-lg ${gradientClass} flex items-center justify-center ${glowClass}`}
      >
        <span className="text-sm font-bold text-white">
          {name.charAt(0)}
        </span>
      </div>
      <div>
        <h3 className="font-semibold text-sm">{name}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
    {connected ? (
      <div className="flex items-center gap-2 text-accent text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" />
        Connected
      </div>
    ) : (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={onConnect}>
        Connect
        <ExternalLink className="w-3.5 h-3.5" />
      </Button>
    )}
  </div>
);

const Settings = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const handleConnect = (platform: string) => {
    toast({
      title: "Coming soon",
      description: `${platform} OAuth integration will be connected shortly.`,
    });
  };

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
          <div className="space-y-3">
            <PlatformCard
              name="Meta Ads"
              description="Connect your Facebook & Instagram ad accounts"
              connected={false}
              gradientClass="platform-meta"
              glowClass="glow-meta"
              onConnect={() => handleConnect("Meta")}
            />
            <PlatformCard
              name="Google Ads"
              description="Connect your Google Ads manager account"
              connected={false}
              gradientClass="platform-google"
              glowClass="glow-google"
              onConnect={() => handleConnect("Google")}
            />
            <PlatformCard
              name="Shopify"
              description="Connect your Shopify store for revenue data"
              connected={false}
              gradientClass="platform-shopify"
              glowClass="glow-shopify"
              onConnect={() => handleConnect("Shopify")}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default Settings;
