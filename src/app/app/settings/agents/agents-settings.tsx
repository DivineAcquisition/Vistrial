"use client";

import { useActionState } from "react";

import {
  saveAgentHalt,
  saveAgentIdentity,
  saveOrgAgent,
} from "@/app/app/settings/agents/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/states";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SectionHeader } from "@/components/ui/section-header";
import type { AgentSettingsView } from "@/lib/agents/settings";
import { globalHaltLabel, observationModeLabel, perAppHaltLabel } from "@/lib/agents/labels";
import { PROSPECT_SAID_VISUAL_CLASS, RESEARCH_VISUAL_CLASS } from "@/lib/agents/research";
import { errorClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function AgentsSettingsForm({ view }: { view: AgentSettingsView }) {
  const [haltState, saveHalt, haltPending] = useActionState(saveAgentHalt, idle);
  const [identityState, saveIdentity, identityPending] = useActionState(saveAgentIdentity, idle);
  const [agentState, saveAgent, agentPending] = useActionState(saveOrgAgent, idle);
  useSettingsToast(haltState, haltPending);
  useSettingsToast(identityState, identityPending);
  useSettingsToast(agentState, agentPending);

  return (
    <div className="space-y-10">
      <section>
        <SectionHeader
          title="Stop"
          hint="These switches stop agents immediately. Connected apps stay connected."
        />
        <SettingsFormCard
          action={saveHalt}
          footer={<SubmitButton pending={haltPending}>Save stops</SubmitButton>}
        >
          <Switch
            name="agents_halted"
            defaultChecked={view.halt.global}
            label={globalHaltLabel()}
            description="Every agent stops. Work already confirmed still stands."
          />
          <Switch
            name="agent_crm_writes_halted"
            defaultChecked={view.halt.apps.crm}
            label={perAppHaltLabel("crm")}
            description="Agents cannot change the CRM. The connection stays up."
          />
          <Switch
            name="agent_calendar_writes_halted"
            defaultChecked={view.halt.apps.calendar}
            label={perAppHaltLabel("calendar")}
            description="Agents cannot put holds on a calendar. Prospect bookings are never changed."
          />
          {haltState.status === "error" ? <p className={errorClass}>{haltState.error}</p> : null}
        </SettingsFormCard>
      </section>

      <section>
        <SectionHeader
          title="Who scheduled work runs as"
          hint="On-demand work runs as the person who asked. Scheduled and triggered work runs as this person, with their permissions. Never more."
        />
        <SettingsFormCard
          action={saveIdentity}
          footer={<SubmitButton pending={identityPending}>Save who it runs as</SubmitButton>}
        >
          <Field
            label="Team member"
            name="agent_run_as_member_id"
            help="They appear on People with “Runs scheduled work”. Pick someone with the least access that still lets the work happen."
          >
            <Select
              id="agent_run_as_member_id"
              name="agent_run_as_member_id"
              defaultValue={view.serviceMember?.memberId ?? ""}
            >
              <option value="">None — scheduled work will not run</option>
              {view.members
                .filter((member) => member.active)
                .map((member) => (
                  <option key={member.memberId} value={member.memberId}>
                    {member.displayName} ({member.role})
                  </option>
                ))}
            </Select>
          </Field>
          {identityState.status === "error" ? <p className={errorClass}>{identityState.error}</p> : null}
        </SettingsFormCard>
      </section>

      {view.agents.map((agent) => (
        <section key={agent.id}>
          <SectionHeader title={agent.label} hint={agent.summary} />
          <SettingsFormCard
            action={saveAgent}
            footer={<SubmitButton pending={agentPending}>Save {agent.label.toLowerCase()}</SubmitButton>}
          >
            <input type="hidden" name="agent_id" value={agent.id} />
            <Switch
              name="enabled"
              defaultChecked={agent.settings.enabled}
              label="On"
              description="Off until you turn it on. A new agent starts off."
            />
            {agent.writes ? (
              <>
                <Switch
                  name="observation_mode"
                  defaultChecked={agent.settings.observationMode}
                  label={observationModeLabel()}
                  description="Output is recorded. Nothing is applied until you turn this off after reviewing runs."
                />
                <input type="hidden" name="allow_act" value="on" />
              </>
            ) : null}
            <Field label="Daily run cap" name="daily_run_cap" help="Hard stop. It does not keep going after this.">
              <Input
                id="daily_run_cap"
                name="daily_run_cap"
                type="number"
                min={1}
                max={1000}
                defaultValue={agent.settings.dailyRunCap}
              />
            </Field>
            <Field
              label="Daily spend cap, US dollars"
              name="daily_spend_cap_usd"
              help="Hard stop. Spend is counted for this agent in this workspace."
            >
              <Input
                id="daily_spend_cap_usd"
                name="daily_spend_cap_usd"
                type="number"
                min={0}
                max={10000}
                step="0.01"
                defaultValue={agent.settings.dailySpendCapUsd}
              />
            </Field>
            {agentState.status === "error" ? <p className={errorClass}>{agentState.error}</p> : null}
          </SettingsFormCard>
        </section>
      ))}

      <section>
        <SectionHeader
          title="What a prospect said, and what we found"
          hint="Those two things never look the same. Mixing them is how a call goes badly wrong."
        />
        <Notice tone="info">
          <p className={PROSPECT_SAID_VISUAL_CLASS}>What they said on the call stays marked as theirs.</p>
          <p className={`mt-2 ${RESEARCH_VISUAL_CLASS}`}>
            Found online stays marked with the source and the date. Research is companies only.
          </p>
        </Notice>
      </section>
    </div>
  );
}
