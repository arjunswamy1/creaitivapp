import React, { createContext, useContext, useState, type ReactNode } from "react";
import { BILLY_VERTICALS, type VerticalConfig } from "@/config/billyVerticals";

interface VerticalContextValue {
  activeVertical: VerticalConfig;
  setActiveVertical: (v: VerticalConfig) => void;
  verticals: VerticalConfig[];
}

const VerticalContext = createContext<VerticalContextValue | null>(null);

export function VerticalProvider({ children }: { children: ReactNode }) {
  const [activeVertical, setActiveVertical] = useState<VerticalConfig>(BILLY_VERTICALS[0]);

  return (
    <VerticalContext.Provider value={{ activeVertical, setActiveVertical, verticals: BILLY_VERTICALS }}>
      {children}
    </VerticalContext.Provider>
  );
}

export function useVertical() {
  const ctx = useContext(VerticalContext);
  if (!ctx) throw new Error("useVertical must be used within VerticalProvider");
  return ctx;
}
