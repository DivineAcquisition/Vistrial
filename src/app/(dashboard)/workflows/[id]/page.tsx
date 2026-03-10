import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedContext, getSupabaseServerClient } from "@/lib/supabase/server";
import {
  RiArrowLeftLine,
  RiPlayLine,
  RiPauseLine,
  RiSettings4Line,
  RiGroupLine,
  RiMessageLine,
  RiTimeLine,
  RiMailLine,
} from "@remixicon/react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkflowDetailPage({ params }: PageProps) {
  const { id } = await params;
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect("/login");

  const supabase = await getSupabaseServerClient();
  const org = context.organization as Record<string, any>;

  const { data: workflow } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .eq("organization_id", org.id)
    .single();

  if (!workflow) redirect("/workflows");

  const wf = workflow as Record<string, any>;
  const steps = Array.isArray(wf.steps) ? wf.steps : [];
  const settings = (wf.settings || {}) as Record<string, any>;

  const { data: enrollments } = await supabase
    .from("workflow_enrollments")
    .select("id, status, contact_id, enrolled_at, responded_at, contacts(first_name, last_name, phone)")
    .eq("workflow_id", id)
    .eq("organization_id", org.id)
    .order("enrolled_at", { ascending: false })
    .limit(10);

  const { count: enrolledCount } = await supabase
    .from("workflow_enrollments")
    .select("*", { count: "exact", head: true })
    .eq("workflow_id", id);

  const { count: completedCount } = await supabase
    .from("workflow_enrollments")
    .select("*", { count: "exact", head: true })
    .eq("workflow_id", id)
    .eq("status", "completed");

  const { count: respondedCount } = await supabase
    .from("workflow_enrollments")
    .select("*", { count: "exact", head: true })
    .eq("workflow_id", id)
    .not("responded_at", "is", null);

  const { count: messageCount } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("workflow_id", id);

  const enrolled = enrolledCount || 0;
  const completed = completedCount || 0;
  const responded = respondedCount || 0;
  const messages = messageCount || 0;
  const responseRate = enrolled > 0 ? Math.round((responded / enrolled) * 100) : 0;

  const statusColors: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    paused: "bg-amber-50 text-amber-700 ring-amber-600/15",
    draft: "bg-gray-100 text-gray-600 ring-gray-200/60",
    archived: "bg-red-50 text-red-700 ring-red-600/15",
  };

  const stepTypeConfig: Record<string, { icon: typeof RiMessageLine; label: string; color: string }> = {
    sms: { icon: RiMessageLine, label: "SMS", color: "brand" },
    email: { icon: RiMailLine, label: "Email", color: "blue" },
    delay: { icon: RiTimeLine, label: "Wait", color: "gray" },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/workflows"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-2 transition-colors text-sm"
          >
            <RiArrowLeftLine className="w-4 h-4" />
            Back to Workflows
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{wf.name}</h1>
            <span className={`px-2.5 py-1 text-[11px] font-medium rounded-lg ring-1 ring-inset ${statusColors[wf.status] || statusColors.draft}`}>
              {wf.status}
            </span>
          </div>
          {wf.description && (
            <p className="text-gray-500 mt-1 text-sm">{wf.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/workflows/${id}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
          >
            <RiSettings4Line className="w-4 h-4" />
            Settings
          </Link>
          {wf.status === "active" ? (
            <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors text-sm">
              <RiPauseLine className="w-4 h-4" />
              Pause
            </button>
          ) : (
            <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors text-sm">
              <RiPlayLine className="w-4 h-4" />
              Activate
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Workflow Steps</h2>
              <span className="text-sm text-gray-400">{steps.length} steps</span>
            </div>

            {steps.length > 0 ? (
              <div className="space-y-3">
                {steps.map((step: any, index: number) => {
                  const config = stepTypeConfig[step.type] || stepTypeConfig.sms;
                  const Icon = config.icon;
                  return (
                    <div key={step.id || index}>
                      <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-xl border border-gray-100">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-sm font-semibold">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-brand-50 text-brand-700 uppercase">{config.label}</span>
                            {(step.delay_value || step.delay_days || step.delay_hours) && (
                              <span className="text-xs text-gray-400">
                                Wait {step.delay_value || step.delay_days || step.delay_hours} {step.delay_unit || (step.delay_days ? 'days' : 'hours')}
                              </span>
                            )}
                          </div>
                          {step.template && (
                            <p className="text-gray-600 text-sm leading-relaxed">{step.template}</p>
                          )}
                          {step.content && !step.template && (
                            <p className="text-gray-600 text-sm leading-relaxed">{step.content}</p>
                          )}
                          {step.email_subject && (
                            <p className="text-gray-400 text-xs mt-1">Subject: {step.email_subject}</p>
                          )}
                        </div>
                      </div>
                      {index < steps.length - 1 && (
                        <div className="flex justify-center py-1">
                          <div className="w-px h-4 bg-gray-200" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <RiMessageLine className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No steps configured yet</p>
                <p className="text-gray-400 text-xs mt-1">Edit this workflow to add steps</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Performance</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Enrolled</span>
                <span className="text-gray-900 font-semibold">{enrolled}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Completed</span>
                <span className="text-gray-900 font-semibold">{completed}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Response Rate</span>
                <span className="text-emerald-600 font-semibold">{responseRate}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Messages Sent</span>
                <span className="text-gray-900 font-semibold">{messages}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Recent Enrollments</h3>
              <span className="text-xs text-gray-400">{enrolled} total</span>
            </div>

            {enrollments && enrollments.length > 0 ? (
              <div className="space-y-3">
                {enrollments.map((enrollment: any) => {
                  const contact = enrollment.contacts;
                  return (
                    <div key={enrollment.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="text-gray-900 font-medium">
                          {contact?.first_name} {contact?.last_name}
                        </p>
                        <p className="text-gray-400 text-xs">{contact?.phone}</p>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                        enrollment.status === "active" ? "bg-emerald-50 text-emerald-700" :
                        enrollment.status === "completed" ? "bg-blue-50 text-blue-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {enrollment.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <RiGroupLine className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">No contacts enrolled yet</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Settings</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Sending hours</span>
                <span className="text-gray-700">{settings.send_window_start || '9:00 AM'} - {settings.send_window_end || '8:00 PM'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Skip weekends</span>
                <span className="text-gray-700">{settings.skip_weekends !== false ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Category</span>
                <span className="text-gray-700 capitalize">{wf.category || 'General'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
