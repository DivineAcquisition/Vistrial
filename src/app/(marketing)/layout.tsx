import { MarketingAnalytics } from "@/components/marketing/analytics";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <MarketingAnalytics />
      {children}
    </div>
  );
}
