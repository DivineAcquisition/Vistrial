import Link from "next/link";

import { CreateTemplateForm } from "@/components/config/template-forms";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/gates";
import { loadTemplates } from "@/lib/config/screens";
import { createClient } from "@/lib/supabase/server";
import { cardTitle } from "@/lib/ui";

export const metadata = { title: "Templates" };

const STATUS_TONE = { draft: "neutral", active: "good", retired: "warning" } as const;

/** Industry templates and the platform default every workspace builds on. */
export default async function TemplatesPage() {
  const ctx = await requireStaff();
  const supabase = await createClient();
  const [templates, { data: pins }, { data: orgs }] = await Promise.all([
    loadTemplates(supabase),
    supabase.from("workspace_config_pins").select("template_id"),
    supabase.from("organizations").select("id, name").order("name"),
  ]);
  const inUse = (templateId: string) => (pins ?? []).filter((pin) => pin.template_id === templateId).length;

  return (
    <PageFrame
      title="Templates"
      description="Each industry template sets sensible defaults for a kind of business. Workspaces start from one and override only what they need."
    >
      <div className="flex max-w-5xl flex-col gap-6">
        <Panel className="overflow-hidden px-2 py-2 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Workspaces</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Link href="/app/team/templates/platform" className="text-white hover:underline">
                    Platform default
                  </Link>
                  <div className="text-xs text-muted-foreground">Under every template. Locked rules here apply everywhere.</div>
                </TableCell>
                <TableCell>
                  <StatusBadge label="always on" tone="brand" />
                </TableCell>
                <TableCell>—</TableCell>
                <TableCell>All</TableCell>
              </TableRow>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <Link href={`/app/team/templates/${template.id}`} className="text-white hover:underline">
                      {template.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{template.description}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={template.status} tone={STATUS_TONE[template.status as keyof typeof STATUS_TONE] ?? "neutral"} />
                  </TableCell>
                  <TableCell>{template.version}</TableCell>
                  <TableCell>{inUse(template.id)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        {ctx.templateAccess ? (
          <Panel className="p-6">
            <h2 className={cardTitle}>New template</h2>
            <div className="mt-4">
              <CreateTemplateForm
                templates={templates.map((template) => ({ id: template.id, name: template.name }))}
                workspaces={(orgs ?? []).map((org) => ({ id: org.id, name: org.name }))}
              />
            </div>
          </Panel>
        ) : null}
      </div>
    </PageFrame>
  );
}
