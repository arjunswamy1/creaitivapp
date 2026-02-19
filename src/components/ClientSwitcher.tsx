import { useClient } from "@/contexts/ClientContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

const ClientSwitcher = () => {
  const { clients, activeClient, setActiveClientId } = useClient();

  if (clients.length <= 1) {
    return activeClient ? (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 text-sm font-medium">
        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        {activeClient.name}
      </div>
    ) : null;
  }

  return (
    <Select value={activeClient?.id || ""} onValueChange={setActiveClientId}>
      <SelectTrigger className="w-[200px] h-9 text-sm">
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
          <SelectValue placeholder="Select client" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {clients.map((client) => (
          <SelectItem key={client.id} value={client.id}>
            {client.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ClientSwitcher;
