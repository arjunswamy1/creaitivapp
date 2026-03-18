import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Client {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_colors: Record<string, string>;
}

export interface ClientDashboardConfig {
  enabled_platforms: string[];
  enabled_kpis: string[];
  custom_metrics: any[];
  revenue_source: string;
  triplewhale_enabled?: boolean;
  triplewhale_shop_domain?: string;
}

interface ClientContextType {
  clients: Client[];
  activeClient: Client | null;
  setActiveClientId: (id: string) => void;
  dashboardConfig: ClientDashboardConfig | null;
  isAgencyAdmin: boolean;
  loading: boolean;
}

const ClientContext = createContext<ClientContextType>({
  clients: [],
  activeClient: null,
  setActiveClientId: () => {},
  dashboardConfig: null,
  isAgencyAdmin: false,
  loading: true,
});

export const useClient = () => useContext(ClientContext);

export const ClientProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [dashboardConfig, setDashboardConfig] = useState<ClientDashboardConfig | null>(null);
  const [isAgencyAdmin, setIsAgencyAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch clients the user belongs to
  useEffect(() => {
    if (!user) {
      setClients([]);
      setActiveClientId(null);
      setLoading(false);
      return;
    }

    const fetchClients = async () => {
      // Get memberships
      const { data: memberships } = await supabase
        .from("client_members")
        .select("client_id, role")
        .eq("user_id", user.id);

      if (!memberships || memberships.length === 0) {
        setLoading(false);
        return;
      }

      setIsAgencyAdmin(memberships.some((m) => m.role === "agency_admin"));

      const clientIds = memberships.map((m) => m.client_id);
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, slug, logo_url, brand_colors")
        .in("id", clientIds);

      if (clientData) {
        setClients(clientData as Client[]);
        // Restore last selected or pick first
        const stored = localStorage.getItem("activeClientId");
        const valid = clientData.find((c) => c.id === stored);
        setActiveClientId(valid ? valid.id : clientData[0]?.id || null);
      }
      setLoading(false);
    };

    fetchClients();
  }, [user]);

  // Fetch dashboard config when active client changes
  useEffect(() => {
    if (!activeClientId) {
      setDashboardConfig(null);
      return;
    }

    localStorage.setItem("activeClientId", activeClientId);

    const fetchConfig = async () => {
      const { data } = await supabase
        .from("client_dashboard_config")
        .select("enabled_platforms, enabled_kpis, custom_metrics, revenue_source, triplewhale_enabled, triplewhale_shop_domain")
        .eq("client_id", activeClientId)
        .maybeSingle();

      setDashboardConfig(
        data
          ? {
              enabled_platforms: data.enabled_platforms || [],
              enabled_kpis: data.enabled_kpis || [],
              custom_metrics: data.custom_metrics as any[] || [],
              revenue_source: (data as any).revenue_source || "subbly",
            }
          : {
              enabled_platforms: ["meta", "google", "shopify"],
              enabled_kpis: ["totalSpend", "totalRevenue", "blendedROAS", "conversions", "cpc", "ctr", "cpm", "impressions"],
              custom_metrics: [],
              revenue_source: "subbly",
            }
      );
    };

    fetchConfig();
  }, [activeClientId]);

  const activeClient = clients.find((c) => c.id === activeClientId) || null;

  return (
    <ClientContext.Provider
      value={{
        clients,
        activeClient,
        setActiveClientId,
        dashboardConfig,
        isAgencyAdmin,
        loading,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
};
