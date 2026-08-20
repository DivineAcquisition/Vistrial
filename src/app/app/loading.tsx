import { ListPageSkeleton } from "@/components/app/page-skeletons";

export default function AppLoading() {
  return (
    <ListPageSkeleton title="Loading" description="Opening this section." rows={5} />
  );
}
