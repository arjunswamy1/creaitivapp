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
  const { activeClient } = useClient();
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
        setAccounts(adAccounts);
        const sel = data.selected_ad_account as unknown as SelectedAccount | null;
        if (sel?.id) {
          setSelected(sel.id);
        }
      }
      setLoading(false);
    };
    fetchAccounts();
  }, [clientId]);

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
    setSelected(accountId);
    const account = accounts.find((a) => a.id === accountId);
    if (account) {
      await saveSelection(account);
    }
  };

  if (loading || accounts.length === 0) return null;

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
