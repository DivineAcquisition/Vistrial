import type { WorkspaceRole } from "@/lib/auth/types";

export type WorkflowPowers = {
  view: boolean;
  edit: boolean;
  publish: boolean;
  /** Staff publish waits for the Owner. */
  proposePublish: boolean;
  confirm: boolean;
  enrollExisting: boolean;
  takeOver: boolean;
  skip: boolean;
  pauseLead: boolean;
  seeCanvas: boolean;
  seeOthers: boolean;
  manageFlag: boolean;
  editTemplates: boolean;
  publishTemplates: boolean;
};

const NONE: WorkflowPowers = {
  view: false,
  edit: false,
  publish: false,
  proposePublish: false,
  confirm: false,
  enrollExisting: false,
  takeOver: false,
  skip: false,
  pauseLead: false,
  seeCanvas: false,
  seeOthers: false,
  manageFlag: false,
  editTemplates: false,
  publishTemplates: false,
};

export function workflowPowers(role: WorkspaceRole, manage: boolean): WorkflowPowers {
  if (role === "operator") {
    return { ...NONE, takeOver: true, pauseLead: true };
  }
  if (role === "member") {
    return {
      ...NONE,
      view: true,
      seeCanvas: true,
      seeOthers: true,
      edit: manage,
      publish: manage,
      takeOver: manage,
      skip: manage,
      pauseLead: true,
    };
  }
  if (role === "owner") {
    return {
      ...NONE,
      view: true,
      edit: true,
      publish: true,
      confirm: true,
      enrollExisting: true,
      takeOver: true,
      skip: true,
      pauseLead: true,
      seeCanvas: true,
      seeOthers: true,
    };
  }
  if (role === "service_team") {
    return {
      ...NONE,
      view: true,
      edit: true,
      proposePublish: true,
      takeOver: true,
      skip: true,
      pauseLead: true,
      seeCanvas: true,
      seeOthers: true,
      manageFlag: true,
    };
  }
  if (role === "platform_admin") {
    return {
      ...NONE,
      view: true,
      edit: true,
      proposePublish: true,
      takeOver: true,
      skip: true,
      pauseLead: true,
      seeCanvas: true,
      seeOthers: true,
      manageFlag: true,
      editTemplates: true,
      publishTemplates: true,
    };
  }
  return NONE;
}

/** Plans that include Workflows. Enforced again on the server. */
export const WORKFLOW_PLANS = ["private_access", "custom", "internal", "pilot"] as const;

export function planAllowsWorkflows(planId: string | null): boolean {
  if (!planId) return true;
  return (WORKFLOW_PLANS as readonly string[]).includes(planId);
}
