"use client";

import { useState } from "react";

import {
  ChatPage,
  DashboardPage,
  FullWidthTablePage,
  ListDetailPage,
  MessagePage,
  RecordPage,
  StandardPage,
  WorkflowPage,
} from "@/components/layouts/page-layouts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Stepper } from "@/components/ui/stepper";
import { bodyText, filterBar } from "@/lib/ui";
import type { PageLayoutKind } from "@/lib/shell/nav";

const ROWS = [
  { name: "Avery Cole", status: "Waiting", due: "Today" },
  { name: "Jordan Hale", status: "In conversation", due: "Tomorrow" },
  { name: "Riley Chen", status: "Booked", due: "Friday" },
];

export function LayoutSample({ kind }: { kind: PageLayoutKind }) {
  switch (kind) {
    case "standard":
      return (
        <StandardPage
          width="reading"
          header={
            <PageHeader
              title="Workspace settings"
              description="A single column for a form or a simple page."
            />
          }
        >
          <Card className="p-6">
            <p className={bodyText}>Sample fields sit here. Nothing on this page is live.</p>
          </Card>
        </StandardPage>
      );
    case "dashboard":
      return (
        <DashboardPage
          header={<PageHeader title="Overview" description="Stat cards, then panels that reflow." />}
          stats={
            <>
              <KpiCard label="Booked" value={12} tone="good" />
              <KpiCard label="Waiting" value={4} tone="warning" />
              <KpiCard label="Due today" value={3} />
              <KpiCard label="Closed" value={7} tone="good" />
            </>
          }
        >
          <Card className="p-6"><p className={bodyText}>Panel one. Sample only.</p></Card>
          <Card className="p-6"><p className={bodyText}>Panel two. Sample only.</p></Card>
          <Card className="p-6"><p className={bodyText}>Panel three. Sample only.</p></Card>
        </DashboardPage>
      );
    case "list-detail":
      return <ListDetailSample />;
    case "table":
      return (
        <FullWidthTablePage
          header={<PageHeader title="Client roster" description="A dense table on a wide screen, cards on a phone." />}
          filters={<div className={filterBar}><p className={bodyText}>Filter bar stays with the table.</p></div>}
          table={
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-background">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.name} className="border-t border-border">
                    <td className="px-3 py-3">{row.name}</td>
                    <td className="px-3 py-3">{row.status}</td>
                    <td className="px-3 py-3">{row.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          cards={ROWS.map((row) => (
            <Card key={row.name} className="p-4">
              <p className="font-medium text-card-foreground">{row.name}</p>
              <p className={bodyText}>{row.status} · {row.due}</p>
            </Card>
          ))}
        />
      );
    case "record":
      return (
        <RecordPage
          header={
            <PageHeader
              title="Avery Cole"
              description="A record header, tabs, and a side panel that drops below on a small screen."
              status="Waiting"
              statusTone="warning"
              actions={<Button size="sm">Primary action</Button>}
            />
          }
          tabs={
            <div className="flex gap-2">
              <Badge>Overview</Badge>
              <Badge variant="outline">Activity</Badge>
            </div>
          }
          aside={
            <Card className="p-4">
              <p className="text-sm font-medium text-card-foreground">Side panel</p>
              <p className={bodyText}>Sits to the right on a large screen and below the record on a phone.</p>
            </Card>
          }
        >
          <Card className="p-6">
            <p className={bodyText}>The main record. Sample only.</p>
          </Card>
        </RecordPage>
      );
    case "workflow":
      return (
        <WorkflowPage
          progress={
            <Stepper
              label="Sample steps"
              currentId="details"
              steps={[
                { id: "start", label: "Start", done: true },
                { id: "details", label: "Details" },
                { id: "review", label: "Review" },
              ]}
            />
          }
          footer={
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" size="sm">Back</Button>
              <Button size="sm">Continue</Button>
            </div>
          }
        >
          <Card className="p-6">
            <p className={bodyText}>One step. The footer stays put while this scrolls.</p>
          </Card>
        </WorkflowPage>
      );
    case "chat":
      return (
        <ChatPage
          aside={
            <Card className="m-4 p-4">
              <p className="text-sm font-medium text-card-foreground">Live activity</p>
              <p className={bodyText}>Sample side panel. It sits below the conversation on a phone.</p>
            </Card>
          }
        >
          <div className="flex h-full min-h-64 flex-col justify-end p-4">
            <p className={bodyText}>Sample conversation. The agent is not part of this layout.</p>
          </div>
        </ChatPage>
      );
    case "message":
      return (
        <MessagePage>
          <Card className="w-full p-6 text-center">
            <p className="font-heading text-xl text-card-foreground">Page not found</p>
            <p className={`mt-2 ${bodyText}`}>A centered message. Sample only.</p>
          </Card>
        </MessagePage>
      );
    default:
      return null;
  }
}

function ListDetailSample() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(ROWS[0]?.name ?? "");
  return (
    <ListDetailPage
      header={<PageHeader title="Case files" description="The list, then the selected record." />}
      detailOpen={open}
      back={
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Back
        </Button>
      }
      list={
        <ul className="grid gap-2">
          {ROWS.map((row) => (
            <li key={row.name}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border px-3 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setName(row.name);
                  setOpen(true);
                }}
              >
                <span className="truncate">{row.name}</span>
                <span className="text-muted-foreground">{row.status}</span>
              </button>
            </li>
          ))}
        </ul>
      }
      detail={
        <Card className="p-6">
          <p className="font-medium text-card-foreground">{name}</p>
          <p className={bodyText}>Selected record. Sample only.</p>
        </Card>
      }
    />
  );
}
