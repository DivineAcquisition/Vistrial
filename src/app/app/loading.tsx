import { PageFrame } from "@/components/app/page-frame";
import { PageLoader } from "@/components/app/page-loader";

export default function AppLoading() {
  return (
    <PageFrame title="Loading" description="Opening this section.">
      <PageLoader />
    </PageFrame>
  );
}
