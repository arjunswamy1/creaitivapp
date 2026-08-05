import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { useClient } from "@/contexts/ClientContext";

interface AdAccount {
  id: string;
  name: string;
  account_id?: string;
}

interface SelectedAccount {
  id: string;
  name: string;
}

const AccountSelector = () => {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { activeClient, isAgencyAdmin } = useClient();
  const clientId = activeClient?.id;

  useEffect(() => {
    const fetchAccounts = async () => {
      setLoading(true);
      setAccounts([]);
      setSelected(null);

      let query = supabase
        .from("platform_connections")
        .select("metadata, selected_ad_account, id")
        .eq("platform", "meta");

      if (clientId) {
        query = query.eq("client_id", clientId);
      }

      const { data } = await query.maybeSingle();

      if (data) {
        const adAccounts: AdAccount[] = (data.metadata as any)?.ad_accounts || [];
        const sel = data.selected_ad_account as unknown as SelectedAccount | null;

        if (isAgencyAdmin) {
          // Agency admins can freely filter across every ad account on the connection.
          setAccounts(adAccounts.length > 0 ? adAccounts : sel ? [{ id: sel.id, name: sel.name }] : []);
        } else {
          // Client users only ever see accounts that have synced data for their own client,
          // so unrelated agency accounts can never appear in their view.
          let allowedIds: string[] = [];
          if (clientId) {
            const { data: rows } = await supabase
              .from("ad_campaigns")
              .select("account_id")
              .eq("client_id", clientId)
              .eq("platform", "meta")
              .not("account_id", "is", null)
              .limit(1000);
            allowedIds = Array.from(new Set((rows || []).map((r: any) => String(r.account_id))));
          }

          const filtered = adAccounts.filter((a) => {
            const bare = String(a.account_id || a.id).replace(/^act_/, "");
            return allowedIds.includes(bare);
          });

          setAccounts(
            filtered.length > 0 ? filtered : sel ? [{ id: sel.id, name: sel.name }] : []
          );
        }

        if (sel?.id) {
          setSelected(sel.id);
        }
      }
      setLoading(false);
    };
    fetchAccounts();
  }, [clientId, isAgencyAdmin]);


  const saveSelection = async (account: AdAccount) => {
    let query = supabase
      .from("platform_connections")
      .update({ selected_ad_account: { id: account.id, name: account.name } })
      .eq("platform", "meta");

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    await query;
  };

  const handleChange = async (accountId: string) => {
    if (!isAgencyAdmin) return;
    setSelected(accountId);
    const account = accounts.find((a) => a.id === accountId);
    if (account) {
      await saveSelection(account);
    }
  };

  if (loading || accounts.length === 0) return null;

  // Client users see their own account as a static label — no switching.
  if (!isAgencyAdmin) {
    const current = accounts.find((a) => a.id === selected) || accounts[0];
    return (
      <div className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md bg-card border border-border text-foreground">
        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="truncate max-w-[180px]">{current.name}</span>
      </div>
    );
  }


  return (
    <Select value={selected || undefined} onValueChange={handleChange}>
      <SelectTrigger className="w-[220px] h-8 text-xs bg-card border-border">
        <Building2 className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
        <SelectValue placeholder="Select ad account" />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border z-50">
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id} className="text-xs">
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default AccountSelector;
