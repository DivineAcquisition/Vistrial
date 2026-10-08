import { PageFrame } from "@/components/app/page-frame";
import { PageLoader } from "@/components/app/page-loader";

export default function MoreLoading() {
  return (
    <PageFrame
      title="More"
      description="Everything that is not who to call, who you are talking to, or whether this is working."
    >
      <PageLoader />
    </PageFrame>
  );
}
