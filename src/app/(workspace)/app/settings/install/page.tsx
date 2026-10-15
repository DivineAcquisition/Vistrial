import { PageFrame } from "@/components/app/page-frame";

export const metadata = { title: "Install the app" };

export default function InstallPage() {
  return (
    <PageFrame title="Install the app" description="Vistrial on your home screen uses the same sign-in as the website.">
      <div className="space-y-4 text-sm">
        <p>On iPhone or iPad, open the share sheet and choose Add to Home Screen. Push alerts need that step first.</p>
        <p>On Android or a desktop browser, use the install prompt when the browser offers it. If the app is already installed, you do not need to do this again.</p>
        <p>The installed app does not keep lead data on the device. If you are offline, you will see a short page that asks you to try again.</p>
      </div>
    </PageFrame>
  );
}
