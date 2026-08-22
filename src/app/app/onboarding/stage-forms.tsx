"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  ChoiceField,
  LinesField,
  MoneyPerChannel,
  MultiChoiceField,
  NumberField,
  RepeatableRows,
  TextField,
} from "@/app/app/onboarding/fields";
import { saveOnboardingStage, type OnboardingResult } from "@/app/app/onboarding/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Panel } from "@/components/ui/panel";
import { STAGE_META, type ProfileStage } from "@/lib/profile/stages";
import type { ProfileDefaults } from "@/lib/profile/types";
import {
  CHANNEL_PREFERENCES,
  CLOSE_MOTIONS,
  DISQUALIFIERS,
  EXISTING_FOLLOWUPS,
  GOAL_METRICS,
  GOAL_METRICS as GOALS,
  LEAD_CHANNELS,
  OBJECTION_TYPES,
  OFFER_TYPES,
  PAYMENT_STRUCTURES,
  QUALIFICATION_SIGNALS,
  SCORE_FACTOR_CHOICES,
  SETTER_FACTS,
  TEAM_STRUCTURES,
  VOICE_FORMALITIES,
} from "@/lib/profile/vocabulary";
import { btnPrimary, btnSizeMd, errorClass, helperClass } from "@/lib/ui";

const idle: OnboardingResult = { status: "idle" };

const LEAD_STATUS_CHOICES = [
  { value: "new", label: "Brand new, nobody has spoken to them" },
  { value: "working", label: "Being worked" },
  { value: "call_booked", label: "A call is booked" },
  { value: "no_show", label: "They did not show" },
  { value: "follow_up", label: "Waiting on a follow-up" },
  { value: "objection_hold", label: "Held up on an objection" },
  { value: "ghost", label: "Gone quiet" },
  { value: "closed_lost", label: "Lost" },
];

function StageBody({ stage, defaults }: { stage: ProfileStage; defaults: ProfileDefaults }) {
  switch (stage) {
    case "business":
      return (
        <>
          <TextField
            field="offer_name"
            name="offer_name"
            label="What do you sell"
            defaults={defaults}
            placeholder="Private coaching"
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <ChoiceField
              field="offer_type"
              name="offer_type"
              label="Offer type"
              defaults={defaults}
              choices={OFFER_TYPES}
              allowEmpty
            />
            <TextField
              field="offer_type_other"
              name="offer_type_other"
              label="If something else, what"
              defaults={defaults}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField
              field="price_point_cents"
              name="price_point"
              label="Price point"
              defaults={defaults}
              money
              min={0}
              suffix="per client"
            />
            <ChoiceField
              field="payment_structure"
              name="payment_structure"
              label="How they pay"
              defaults={defaults}
              choices={PAYMENT_STRUCTURES}
              allowEmpty
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <NumberField
              field="sales_cycle_days"
              name="sales_cycle_days"
              label="Days from opt-in to close"
              defaults={defaults}
              min={1}
              max={365}
            />
            <NumberField
              field="touches_to_close"
              name="touches_to_close"
              label="Touches it usually takes"
              defaults={defaults}
              min={1}
              max={60}
            />
            <ChoiceField
              field="close_motion"
              name="close_motion"
              label="Calls to close"
              defaults={defaults}
              choices={CLOSE_MOTIONS}
              allowEmpty
            />
          </div>
          <ChoiceField
            field="team_structure"
            name="team_structure"
            label="Who works the leads"
            defaults={defaults}
            choices={TEAM_STRUCTURES}
            allowEmpty
          />
          <div className="grid gap-5 sm:grid-cols-3">
            <NumberField
              field="monthly_lead_volume"
              name="monthly_lead_volume"
              label="Leads a month"
              defaults={defaults}
              min={0}
            />
            <NumberField
              field="monthly_lead_target"
              name="monthly_lead_target"
              label="Leads a month you want"
              defaults={defaults}
              min={0}
            />
            <NumberField
              field="stated_close_rate_pct"
              name="stated_close_rate_pct"
              label="Close rate"
              defaults={defaults}
              min={0}
              max={100}
              step="0.01"
              suffix="%"
            />
          </div>
        </>
      );

    case "funnel":
      return (
        <>
          <MultiChoiceField
            field="lead_channels"
            name="lead_channels"
            label="Where leads come from"
            defaults={defaults}
            choices={LEAD_CHANNELS}
            extra={(channel) => <MoneyPerChannel channel={channel} defaults={defaults} />}
          />
          <p className={helperClass}>
            Spend is optional and only worth filling in where you will share the real number. Cost per
            client is the one figure that needs it.
          </p>
          <TextField
            field="lead_channels_other"
            name="lead_channels_other"
            label="If somewhere else, where"
            defaults={defaults}
          />
          <RepeatableRows
            field="application_fields"
            name="application_fields"
            label="What your application asks"
            defaults={defaults}
            addLabel="Add a question"
            emptyLabel="Nothing is mapped yet. Connect the CRM and these fill themselves in."
            columns={[
              { key: "answer_key", label: "Answer key", kind: "text", placeholder: "budget" },
              {
                key: "factor",
                label: "Scores which factor",
                kind: "select",
                allowEmpty: true,
                choices: SCORE_FACTOR_CHOICES.map((choice) => ({
                  value: choice.value,
                  label: choice.label,
                })),
              },
            ]}
          />
        </>
      );

    case "qualification":
      return (
        <>
          <MultiChoiceField
            field="qualification_signals"
            name="qualification_signals"
            label="What makes a lead worth a call"
            defaults={defaults}
            choices={QUALIFICATION_SIGNALS}
          />
          <TextField
            field="qualification_signals_other"
            name="qualification_signals_other"
            label="If something else, what"
            defaults={defaults}
          />
          <MultiChoiceField
            field="disqualifiers"
            name="disqualifiers"
            label="What rules a lead out"
            defaults={defaults}
            choices={DISQUALIFIERS}
          />
          <TextField
            field="disqualifiers_other"
            name="disqualifiers_other"
            label="If something else, what"
            defaults={defaults}
          />
          <RepeatableRows
            field="price_bands"
            name="price_bands"
            label="Investment answers, and what each one is worth"
            defaults={defaults}
            addLabel="Add a band"
            emptyLabel="No investment bands yet."
            columns={[
              { key: "answer", label: "The answer they give", kind: "text", placeholder: "15k" },
              { key: "score", label: "Score out of 100", kind: "number" },
            ]}
          />
          <RepeatableRows
            field="timeline_bands"
            name="timeline_bands"
            label="Timeline answers, and what each one is worth"
            defaults={defaults}
            addLabel="Add a band"
            emptyLabel="No timeline bands yet."
            columns={[
              { key: "answer", label: "The answer they give", kind: "text", placeholder: "immediately" },
              { key: "score", label: "Score out of 100", kind: "number" },
            ]}
          />
        </>
      );

    case "process":
      return (
        <>
          <NumberField
            field="speed_to_lead_intent_minutes"
            name="speed_to_lead_intent_minutes"
            label="How fast you mean to respond"
            defaults={defaults}
            min={1}
            max={1440}
            suffix="minutes"
          />
          <MultiChoiceField
            field="setter_establishes"
            name="setter_establishes"
            label="What a setter nails down before booking"
            defaults={defaults}
            choices={SETTER_FACTS}
          />
          <TextField
            field="setter_establishes_other"
            name="setter_establishes_other"
            label="If something else, what"
            defaults={defaults}
          />
          <div className="grid gap-5 sm:grid-cols-3">
            <ChoiceField
              field="after_no_show"
              name="after_no_show"
              label="After a no-show, today"
              defaults={defaults}
              choices={EXISTING_FOLLOWUPS}
              allowEmpty
            />
            <ChoiceField
              field="after_call"
              name="after_call"
              label="After a call, today"
              defaults={defaults}
              choices={EXISTING_FOLLOWUPS}
              allowEmpty
            />
            <ChoiceField
              field="after_silence"
              name="after_silence"
              label="After silence, today"
              defaults={defaults}
              choices={EXISTING_FOLLOWUPS}
              allowEmpty
            />
          </div>
          <p className={helperClass}>
            Anything your CRM already sends is switched off here, so nobody gets the same nudge twice.
          </p>
          <RepeatableRows
            field="pipeline_stage_meanings"
            name="pipeline_stage_meanings"
            label="What your pipeline stages actually mean"
            defaults={defaults}
            addLabel="Add a stage"
            emptyLabel="No pipeline stages have arrived from your CRM yet."
            columns={[
              { key: "crm_stage", label: "Stage in your CRM", kind: "text" },
              {
                key: "means",
                label: "Which means",
                kind: "select",
                allowEmpty: true,
                choices: LEAD_STATUS_CHOICES,
              },
            ]}
          />
        </>
      );

    case "objections":
      return (
        <RepeatableRows
          field="top_objections"
          name="top_objections"
          label="What they push back on, in their words"
          defaults={defaults}
          max={8}
          addLabel="Add an objection"
          emptyLabel="Nothing yet. Three is usually enough to start."
          columns={[
            {
              key: "type",
              label: "Type",
              kind: "select",
              choices: OBJECTION_TYPES.map((choice) => ({
                value: choice.value,
                label: choice.label,
              })),
            },
            {
              key: "phrasing",
              label: "How they say it",
              kind: "text",
              placeholder: "I need to think about the money",
            },
            { key: "response", label: "What you say back", kind: "text" },
          ]}
        />
      );

    case "voice":
      return (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <ChoiceField
              field="voice_formality"
              name="voice_formality"
              label="How you write"
              defaults={defaults}
              choices={VOICE_FORMALITIES}
            />
            <ChoiceField
              field="channel_preference"
              name="channel_preference"
              label="Where you follow up"
              defaults={defaults}
              choices={CHANNEL_PREFERENCES}
            />
          </div>
          <LinesField
            field="never_say"
            name="never_say"
            label="Words you never use"
            defaults={defaults}
            placeholder={"unlock\ngame-changer"}
          />
        </>
      );

    case "goals":
      return (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <ChoiceField
              field="goal_metric"
              name="goal_metric"
              label="The number that would make this worth it"
              defaults={defaults}
              choices={GOALS}
            />
            <NumberField
              field="goal_value"
              name="goal_value"
              label="Your target for it"
              defaults={defaults}
              min={0}
              step="0.1"
            />
          </div>
          <p className={helperClass}>
            Reporting is framed against this instead of a generic metric.{" "}
            {GOAL_METRICS.length > 0 ? "You can change it later." : null}
          </p>
          <div>
            <label className="flex items-start gap-3 text-sm text-white">
              <Checkbox
                name="aggregate_opt_out"
                defaultChecked={defaults.aggregate_opt_out?.value === true}
                className="mt-0.5"
              />
              <span>
                Keep my data out of the anonymized patterns.
                <span className="block text-dim">
                  Aggregated, anonymized patterns across clients are what produce the benchmarks and the
                  starting configuration for businesses like yours. Turn this on and nothing of yours
                  goes in. You still get the benchmarks either way.
                </span>
              </span>
            </label>
          </div>
        </>
      );

    case "connect":
      return null;
  }
}

export function StageForm({
  stage,
  defaults,
}: {
  stage: ProfileStage;
  defaults: ProfileDefaults;
}) {
  const [state, action, pending] = useActionState(saveOnboardingStage, idle);
  const meta = STAGE_META[stage];

  return (
    <Panel className="px-6 py-6">
      <h2 className="text-sm font-semibold text-white">{meta.title}</h2>
      <p className={helperClass}>{meta.why}</p>
      <form action={action} className="mt-6 space-y-5">
        <input type="hidden" name="stage" value={stage} />
        <StageBody stage={stage} defaults={defaults} />
        {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
          <button type="submit" className={`${btnPrimary} ${btnSizeMd}`} disabled={pending}>
            {pending ? "Saving…" : `Save and see ${meta.payoff.toLowerCase()}`}
          </button>
          <Link href="/app/settings/business-profile" className="text-sm text-brand-300 hover:text-white">
            Save later
          </Link>
        </div>
      </form>
    </Panel>
  );
}
