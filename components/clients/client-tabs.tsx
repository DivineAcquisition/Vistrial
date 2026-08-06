"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ClientTabs({
  overview,
  definition,
  appointments,
  billing,
  portal,
}: {
  overview: ReactNode;
  definition: ReactNode;
  appointments: ReactNode;
  billing: ReactNode;
  portal: ReactNode;
}) {
  return (
    <Tabs defaultValue="overview" className="mt-8 gap-6">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="definition">Definition</TabsTrigger>
        <TabsTrigger value="appointments">Appointments</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
        <TabsTrigger value="portal">Portal</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="definition">{definition}</TabsContent>
      <TabsContent value="appointments">{appointments}</TabsContent>
      <TabsContent value="billing">{billing}</TabsContent>
      <TabsContent value="portal">{portal}</TabsContent>
    </Tabs>
  );
}
