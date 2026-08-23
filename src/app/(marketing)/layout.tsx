import { MarketingAnalytics } from "@/components/marketing/analytics";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingAnalytics />
      {children}
    </>
  );
}
