import { EmptyState, type EmptyKind } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function ShellPage({
  eyebrow,
  title,
  description,
  emptyTitle,
  emptyDetail,
  kind = "empty",
}: {
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDetail: string;
  kind?: EmptyKind;
}) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <EmptyState kind={kind} title={emptyTitle} detail={emptyDetail} />
    </div>
  );
}
