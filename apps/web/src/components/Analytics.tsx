import Script from "next/script";
import { publicEnv } from "@/lib/env";

/**
 * Google Analytics 4, loaded once from the root layout. The tag is only rendered in a
 * production build with a measurement ID, so local work and previews never count as traffic.
 *
 * Page views: GA4's enhanced measurement listens for history changes, so client-side
 * navigations through the App Router count without any code here. Calls to action: any
 * element with a `data-track` attribute reports a `cta_click` event carrying that value when
 * it is clicked, so the landing page can mark its doors (search, start a community, join
 * with a code) without a client component per button.
 */
export function Analytics() {
  const id = publicEnv.gaMeasurementId;
  if (!id || process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(id)});
document.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target.closest('[data-track]'):null;if(t)gtag('event','cta_click',{cta:t.getAttribute('data-track'),page_path:location.pathname})},true);`}
      </Script>
    </>
  );
}
