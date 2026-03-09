import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, FileText, CheckSquare, Link2, Copy, Check, Loader2, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const NOTION_CLIENT_ID = "31bd872b-594c-8179-93eb-0037c224e8a6";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/notion-oauth-redirect`;

function generateState() {
  return crypto.randomUUID();
}

const ClientManagementHub = () => {
  const [connecting, setConnecting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleConnect = () => {
    const state = generateState();
    stateRef.current = state;
    setConnecting(true);
    setToken(null);
    setWorkspace(null);

    const authUrl =
      `https://api.notion.com/v1/oauth/authorize` +
      `?client_id=${NOTION_CLIENT_ID}` +
      `&response_type=code` +
      `&owner=user` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${state}`;

    window.open(authUrl, "_blank", "width=600,height=700,popup=yes");

    // Poll for token every 2s
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/notion-check-token?state=${state}`
        );
        const data = await res.json();

        if (data.status === "ready") {
          setToken(data.token);
          setWorkspace(data.workspace);
          setConnecting(false);
          stopPolling();
          toast({ title: "Connected!", description: `Workspace: ${data.workspace}` });
        } else if (data.status === "expired") {
          setConnecting(false);
          stopPolling();
          toast({ title: "Session expired", description: "Please try connecting again.", variant: "destructive" });
        }
      } catch {
        // continue polling
      }
    }, 2000);

    // Stop polling after 2 minutes
    setTimeout(() => {
      if (connecting) {
        stopPolling();
        setConnecting(false);
      }
    }, 120000);
  };

  const handleCopy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Token copied to clipboard." });
  };

  const features = [
    {
      icon: Database,
      title: "Client Database",
      description: "Sync client data directly to your Notion workspace. Keep all account information organized and accessible.",
    },
    {
      icon: FileText,
      title: "Weekly Reports",
      description: "Auto-generate weekly performance reports as Notion pages. Share insights with stakeholders effortlessly.",
    },
    {
      icon: CheckSquare,
      title: "Action Items",
      description: "Create and track optimization tasks in Notion. Never miss a follow-up with automated action items.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Client Management Hub
          </h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">
            Connect your Notion workspace to streamline client management, reporting, and task tracking.
          </p>
        </div>

        {/* Connection Card */}
        <Card className="mb-10 border-2">
          <CardHeader className="text-center pb-2">
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <Link2 className="h-5 w-5 text-primary" />
              Notion Integration
            </CardTitle>
            <CardDescription>
              Authorize access to your Notion workspace to enable client management features.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-4">
            {!token && !connecting && (
              <Button size="lg" onClick={handleConnect} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Connect Notion Workspace
              </Button>
            )}

            {connecting && (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Waiting for authorization… Complete the flow in the popup window.
                </p>
              </div>
            )}

            {token && (
              <div className="w-full max-w-lg space-y-4">
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Connected Workspace</p>
                  <p className="font-semibold text-foreground">{workspace}</p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono truncate">
                    {token}
                  </code>
                  <Button variant="outline" size="icon" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="text-center">
                  <Button variant="ghost" size="sm" onClick={handleConnect}>
                    Reconnect
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feature Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-2">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ClientManagementHub;
