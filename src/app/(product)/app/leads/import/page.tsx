import type { Metadata } from "next";

import { ImportCsv } from "@/components/leads/import-csv";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return <ImportCsv />;
}
