import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useClient } from "@/contexts/ClientContext";

interface BrandTheme {
  background: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  card: string;
  cardForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  fontHeading: string;
  fontBody: string;
  fontImportUrl: string;
}

// Agency defaults (Creaitiv App)
const AGENCY_THEME: BrandTheme = {
  background: "230 40% 16%",
  foreground: "0 0% 98%",
  primary: "15 78% 55%",
  primaryForeground: "0 0% 100%",
  accent: "15 78% 55%",
  accentForeground: "0 0% 100%",
  card: "230 35% 20%",
  cardForeground: "0 0% 98%",
  secondary: "230 30% 24%",
  secondaryForeground: "0 0% 90%",
  muted: "230 25% 22%",
  mutedForeground: "230 10% 60%",
  border: "230 20% 28%",
  fontHeading: "Inter",
  fontBody: "Inter",
  fontImportUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
};

interface BrandingContextType {
  theme: BrandTheme;
  logoUrl: string | null;
  clientName: string;
  isClientBranded: boolean;
}

const BrandingContext = createContext<BrandingContextType>({
  theme: AGENCY_THEME,
  logoUrl: null,
  clientName: "Creaitiv App",
  isClientBranded: false,
});

export const useBranding = () => useContext(BrandingContext);
export { AGENCY_THEME };

// Load a Google Fonts stylesheet dynamically
let currentFontLink: HTMLLinkElement | null = null;
const loadFont = (url: string) => {
  if (currentFontLink?.href === url) return;
  if (currentFontLink) currentFontLink.remove();
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  document.head.appendChild(link);
  currentFontLink = link;
};

const applyTheme = (theme: BrandTheme) => {
  const root = document.documentElement;
  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--foreground", theme.foreground);
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-foreground", theme.primaryForeground);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-foreground", theme.accentForeground);
  root.style.setProperty("--card", theme.card);
  root.style.setProperty("--card-foreground", theme.cardForeground);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--secondary-foreground", theme.secondaryForeground);
  root.style.setProperty("--muted", theme.muted);
  root.style.setProperty("--muted-foreground", theme.mutedForeground);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--input", theme.border);
  root.style.setProperty("--ring", theme.primary);
  root.style.setProperty("--popover", theme.card);
  root.style.setProperty("--popover-foreground", theme.cardForeground);

  // Fonts
  document.body.style.fontFamily = `'${theme.fontBody}', sans-serif`;
  document.querySelectorAll("h1, h2, h3").forEach((el) => {
    (el as HTMLElement).style.fontFamily = `'${theme.fontHeading}', serif`;
  });

  // Set CSS custom properties for fonts so new elements pick them up
  root.style.setProperty("--font-heading", `'${theme.fontHeading}', serif`);
  root.style.setProperty("--font-body", `'${theme.fontBody}', sans-serif`);

  if (theme.fontImportUrl) loadFont(theme.fontImportUrl);
};

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const { activeClient } = useClient();
  const [theme, setTheme] = useState<BrandTheme>(AGENCY_THEME);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [clientName, setClientName] = useState("Creaitiv App");
  const [isClientBranded, setIsClientBranded] = useState(false);

  useEffect(() => {
    if (activeClient && activeClient.brand_colors && Object.keys(activeClient.brand_colors).length > 0) {
      const bc = activeClient.brand_colors as Record<string, string>;
      const clientTheme: BrandTheme = {
        background: bc.background || AGENCY_THEME.background,
        foreground: bc.foreground || AGENCY_THEME.foreground,
        primary: bc.primary || AGENCY_THEME.primary,
        primaryForeground: bc.primaryForeground || AGENCY_THEME.primaryForeground,
        accent: bc.accent || AGENCY_THEME.accent,
        accentForeground: bc.accentForeground || AGENCY_THEME.accentForeground,
        card: bc.card || AGENCY_THEME.card,
        cardForeground: bc.cardForeground || AGENCY_THEME.cardForeground,
        secondary: bc.secondary || AGENCY_THEME.secondary,
        secondaryForeground: bc.secondaryForeground || AGENCY_THEME.secondaryForeground,
        muted: bc.muted || AGENCY_THEME.muted,
        mutedForeground: bc.mutedForeground || AGENCY_THEME.mutedForeground,
        border: bc.border || AGENCY_THEME.border,
        fontHeading: bc.fontHeading || AGENCY_THEME.fontHeading,
        fontBody: bc.fontBody || AGENCY_THEME.fontBody,
        fontImportUrl: bc.fontImportUrl || AGENCY_THEME.fontImportUrl,
      };
      setTheme(clientTheme);
      setLogoUrl(activeClient.logo_url);
      setClientName(activeClient.name);
      setIsClientBranded(true);
      applyTheme(clientTheme);
    } else {
      setTheme(AGENCY_THEME);
      setLogoUrl(null);
      setClientName("Creaitiv App");
      setIsClientBranded(false);
      applyTheme(AGENCY_THEME);
    }
  }, [activeClient]);

  return (
    <BrandingContext.Provider value={{ theme, logoUrl, clientName, isClientBranded }}>
      {children}
    </BrandingContext.Provider>
  );
};
