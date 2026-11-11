import type { Metadata } from "next";

import { ClientsScreen } from "@/components/clients/clients-screen";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return <ClientsScreen />;
}
