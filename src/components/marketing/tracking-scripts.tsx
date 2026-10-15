import Script from "next/script";

import { googleAnalyticsId, metaPixelId } from "@/lib/marketing/tracking-ids";

/** Loads only after the server has decided the visitor accepted and the tool is enabled. */
export function GoogleAnalytics({ id = googleAnalyticsId() }: { id?: string | null }) {
  if (!id) return null;
  const safe = id.replace(/[^A-Z0-9-]/g, "");
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${safe}`} strategy="afterInteractive" />
      <Script id="vistrial-ga" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${safe}',{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false});`}
      </Script>
    </>
  );
}

export function MetaPixel({ id = metaPixelId() }: { id?: string | null }) {
  if (!id) return null;
  const safe = id.replace(/\D/g, "");
  return (
    <Script id="vistrial-meta" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('set','autoConfig',false,'${safe}');fbq('init','${safe}');fbq('track','PageView');`}
    </Script>
  );
}

export function trackMetaLead(): void {
  const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
  if (typeof fbq !== "function") return;
  fbq("track", "Lead");
}
