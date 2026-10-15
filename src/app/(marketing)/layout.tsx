import { MarketingAnalytics } from "@/components/marketing/analytics";
import { CookieBar } from "@/components/marketing/cookie-preferences";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingAnalytics />
      {children}
      <CookieBar />
    </div>
  );
}
