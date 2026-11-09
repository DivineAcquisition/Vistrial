"use client";

import { useClerk } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ProfileEditor } from "@/components/profile/profile-editor";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { parseSection, type SettingsSection } from "@/components/settings/settings-parts";
import {
  AgentsSection,
  BillingSection,
  BusinessSection,
  DataSection,
  PeopleSection,
  YouSection,
  type YouData,
} from "@/components/settings/settings-sections";
import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { showError } from "@/lib/errors/show-error";
import { saveTheme, storedChoice, type ThemeChoice } from "@/lib/theme";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const AGENT = "growth-architect";

export function SettingsScreen() {
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return <LiveSettings shell={shell} />;
}

/** Runs an action and shows the server's reason when it is refused. Resolves either way. */
async function attempt<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch (problem) {
    showError(problem);
    return null;
  }
}

function LiveSettings({ shell }: { shell: WorkspaceShell }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const clerk = useClerk();
  const section = parseSection(params.get("section"), shell.role);
  const workspaceId = shell.workspaceId;
  const staffView = shell.role !== "rep";
  const owner = shell.role === "owner";

  const me = useQuery(api.settings.me, { workspaceId });
  const business = useQuery(api.settings.business, staffView && section === "business" ? { workspaceId } : "skip");
  const profile = useQuery(api.profile.get, staffView && section === "business" ? { workspaceId } : "skip");
  const facts = useQuery(api.facts.list, staffView && section === "business" ? { workspaceId } : "skip");
  const people = useQuery(api.settings.people, staffView && section === "people" ? { workspaceId } : "skip");
  const support = useQuery(api.settings.supportLog, owner && section === "people" ? { workspaceId } : "skip");
  const defaults = useQuery(api.settings.agentDefaults, staffView && section === "agents" ? { workspaceId } : "skip");
  const controls = useQuery(api.controls.get, staffView && section === "agents" ? { workspaceId, agentSlug: AGENT } : "skip");
  const meta = useQuery(api.metaAds.status, staffView && section === "data" ? { workspaceId } : "skip");
  const uploads = useQuery(api.resultUploads.list, staffView && section === "data" ? { workspaceId } : "skip");

  const rememberMe = useMutation(api.settings.rememberMe);
  const rename = useMutation(api.settings.renameWorkspace);
  const setCountry = useMutation(api.settings.setCountry);
  const invite = useMutation(api.workspace.invite);
  const cancelInvite = useMutation(api.settings.cancelInvite);
  const setRole = useMutation(api.settings.setMemberRole);
  const remove = useMutation(api.settings.removeMember);
  const setSupport = useMutation(api.settings.setSupportAccess);
  const setAgent = useMutation(api.workspace.setAgentState);
  const setMode = useMutation(api.settings.setDefaultResearchMode);
  const setPaused = useMutation(api.controls.setPaused);
  const setCaps = useMutation(api.controls.setCaps);
  const setPrefs = useMutation(api.settings.setMyPreferences);

  // This screen renders only once the workspace has loaded in the browser, so the device's choice is readable.
  const [theme, setTheme] = useState<ThemeChoice>(() => storedChoice());
  const [now] = useState(() => Date.now());
  useEffect(() => {
    void rememberMe({ workspaceId }).catch(() => undefined);
  }, [rememberMe, workspaceId]);

  const hrefFor = (next: SettingsSection) => `${pathname}?section=${next}`;
  const go = (next: SettingsSection) => router.replace(hrefFor(next), { scroll: false });

  let body: React.ReactNode = <p className="text-sm text-muted-foreground">Loading settings.</p>;

  if (section === "business" && business && profile !== undefined) {
    body = (
      <BusinessSection
        role={shell.role}
        data={{
          ...business,
          profile: profile.draft
            ? { state: "draft", version: profile.draft.version }
            : profile.confirmed
              ? { state: "confirmed", version: profile.confirmed.version }
              : { state: "none", version: null },
          factCount: facts ? facts.length : null,
        }}
        memoryHref={`/app/agents/${AGENT}/memory`}
        profileEditor={<ProfileEditor workspaceId={workspaceId} role={shell.role} />}
        onRename={(name) => attempt(rename({ workspaceId, name }))}
        onCountry={(country) => attempt(setCountry({ workspaceId, country }))}
      />
    );
  }

  if (section === "people" && people && (!owner || support)) {
    body = (
      <PeopleSection
        role={shell.role}
        data={people}
        grants={support?.grants ?? null}
        now={now}
        onInvite={async (email, role) => {
          const made = await attempt(invite({ workspaceId, email, role }));
          return made ? { link: `${window.location.origin}/join?token=${made.token}` } : null;
        }}
        onCancelInvite={(id) => attempt(cancelInvite({ workspaceId, invitationId: id as Id<"invitations"> }))}
        onRole={(id, role) => attempt(setRole({ workspaceId, memberId: id as Id<"members">, role }))}
        onRemove={(id) => attempt(remove({ workspaceId, memberId: id as Id<"members"> }))}
        onSupport={(on) => attempt(setSupport({ workspaceId, on }))}
      />
    );
  }

  if (section === "agents" && defaults && controls) {
    body = (
      <AgentsSection
        key={`${controls.caps.maxCostCentsPerRun}-${controls.caps.maxCostCentsPerDay}`}
        role={shell.role}
        data={{
          canEdit: defaults.canEdit,
          defaultResearchMode: defaults.defaultResearchMode,
          agents: shell.agents.map((agent) => ({
            slug: agent.slug,
            name: agent.name,
            job: agent.job,
            status: agent.status,
            state: agent.state,
            skills: (agent.skills ?? []).map((skill) => ({ slug: skill.slug, name: skill.name, status: skill.status })),
          })),
          controls: {
            paused: controls.paused,
            halted: controls.halted,
            maxCostCentsPerRun: controls.caps.maxCostCentsPerRun,
            maxCostCentsPerDay: controls.caps.maxCostCentsPerDay,
            daySpentCents: controls.daySpentCents,
            ceiling: controls.ceiling,
          },
        }}
        onAgent={(slug, on) => attempt(setAgent({ workspaceId, slug, state: on ? "on" : "off" }))}
        onMode={(mode) => attempt(setMode({ workspaceId, mode }))}
        onPause={(paused) => attempt(setPaused({ workspaceId, paused }))}
        onCaps={(run, day) =>
          attempt(
            setCaps({
              workspaceId,
              agentSlug: AGENT,
              maxCostCentsPerRun: run,
              maxCostCentsPerDay: day,
              maxSteps: controls.caps.maxSteps,
              maxDurationMs: controls.caps.maxDurationMs,
            }),
          )
        }
      />
    );
  }

  if (section === "data" && meta && uploads) {
    const conn = meta.connection;
    body = (
      <DataSection
        role={shell.role}
        data={{
          canManage: meta.canManage,
          files: uploads.filter((row) => row.status === "ready").length,
          meta: {
            status: !conn ? "none" : conn.status === "connected" ? "connected" : "reconnect",
            account: conn?.adAccountName ?? null,
            user: conn?.metaUserName ?? null,
            usedBy: conn ? shell.agents.filter((agent) => agent.status === "live" && conn.agents.includes(agent.slug)).map((agent) => agent.name) : [],
          },
        }}
      />
    );
  }

  if (section === "billing") body = <BillingSection />;

  if (section === "you" && me) {
    const data: YouData = {
      name: me.displayName,
      email: me.email,
      role: me.role,
      joinedAt: me.joinedAt,
      theme,
      notifications: me.notifications,
    };
    body = (
      <YouSection
        data={data}
        onTheme={(choice) => {
          setTheme(choice);
          saveTheme(choice);
          void attempt(setPrefs({ workspaceId, theme: choice }));
        }}
        onNotice={(key, on) => attempt(setPrefs({ workspaceId, [key]: on }))}
        onAccount={() => clerk.openUserProfile()}
      />
    );
  }

  return (
    <SettingsLayout role={shell.role} section={section} onSection={go} hrefFor={hrefFor}>
      {body}
    </SettingsLayout>
  );
}
