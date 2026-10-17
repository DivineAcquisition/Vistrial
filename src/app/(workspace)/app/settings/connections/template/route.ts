import { NextResponse } from "next/server";

import { TEMPLATE_CSV } from "@/lib/connectors/files";
import { requireConnectionViewer } from "@/lib/connectors/gate";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireConnectionViewer();
  return new NextResponse(TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vistrial-import-template.csv"',
    },
  });
}
