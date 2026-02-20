import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClient } from "@/contexts/ClientContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  UserPlus,
  Mail,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Invite {
  id: string;
  email: string;
  client_id: string;
  status: string;
  created_at: string;
  accepted_at: string | null;
  client_name?: string;
}

const ClientInviteManager = () => {
  const { clients, activeClient } = useClient();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(activeClient?.id || "");
  const [sending, setSending] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastLink, setLastLink] = useState<string | null>(null);

  useEffect(() => {
    if (activeClient?.id) setSelectedClientId(activeClient.id);
  }, [activeClient?.id]);

  useEffect(() => {
    fetchInvites();
  }, []);

  const fetchInvites = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("client_invites")
      .select("id, email, client_id, status, created_at, accepted_at")
      .order("created_at", { ascending: false });

    if (data) {
      // Map client names
      const enriched = data.map((inv: any) => ({
        ...inv,
        client_name: clients.find((c) => c.id === inv.client_id)?.name || "Unknown",
      }));
      setInvites(enriched);
    }
    setLoading(false);
  };

  const handleSendInvite = async () => {
    if (!email.trim() || !selectedClientId) {
      toast({ title: "Missing info", description: "Enter an email and select a client.", variant: "destructive" });
      return;
    }

    setSending(true);
    setLastLink(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("invite-client-user", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { email: email.trim(), client_id: selectedClientId },
      });

      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      setLastLink(res.data.signup_link);
      toast({ title: "Invite sent!", description: `Access invite sent to ${email}` });
      setEmail("");
      fetchInvites();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send invite", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast({ title: "Copied!", description: "Invite link copied to clipboard" });
  };

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <UserPlus className="w-4 h-4" /> Client Access
      </h2>

      <div className="glass-card p-6 space-y-5">
        <div>
          <p className="font-medium text-sm">Invite Client Users</p>
          <p className="text-xs text-muted-foreground">
            Send view-only dashboard access to your clients. They'll only see their own data.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div className="space-y-2">
            <Label className="text-xs">Email Address</Label>
            <Input
              type="email"
              placeholder="russell@phantasmagorical.co"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendInvite()}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Client</Label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSendInvite} disabled={sending} className="gap-1.5">
            {sending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Mail className="w-3.5 h-3.5" />
            )}
            Send Invite
          </Button>
        </div>

        {lastLink && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <code className="text-xs break-all flex-1 text-muted-foreground">{lastLink}</code>
            <Button size="sm" variant="ghost" onClick={() => copyLink(lastLink)} className="shrink-0 gap-1 text-xs">
              <Copy className="w-3 h-3" /> Copy
            </Button>
          </div>
        )}

        {/* Existing invites */}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : invites.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Sent Invites</p>
            <div className="space-y-2">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">{inv.client_name}</p>
                    </div>
                  </div>
                  <Badge
                    variant={inv.status === "accepted" ? "default" : "secondary"}
                    className="gap-1 text-xs"
                  >
                    {inv.status === "accepted" ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Clock className="w-3 h-3" />
                    )}
                    {inv.status === "accepted" ? "Active" : "Pending"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default ClientInviteManager;
