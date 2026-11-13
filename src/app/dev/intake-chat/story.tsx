"use client";

import { IntakeChatView, type IntakeMessage, type IntakeView } from "@/components/sessions/intake-chat-view";

/** A made-up marketing agency that serves coaches. The competitors are invented; none is a real business. */
const OBJECTIVE = "I want to know why we're not signing more coaching clients compared to other agencies";
const FOUND = [
  { name: "Rival Growth", url: "https://rival-growth.example.com/", origin: "found" },
  { name: "Northbank Funnels", url: "https://northbank-funnels.example.com/", origin: "found" },
  { name: "Coach Funnel Co", url: "https://coachfunnelco.example.com/", origin: "found" },
  { name: "Calendar Full", url: "https://calendar-full.example.com/", origin: "found" },
  { name: "Brightside Agency", url: "https://brightside-agency.example.com/", origin: "found" },
  { name: "Signal and Scale", url: "https://signal-and-scale.example.com/", origin: "found" },
];
const NOTE = "For agencies that serve coaches, web search and Instagram likely matter most, with Meta ads close behind, since coaches look for help where they already post. Vistrial will still look at all of them until it knows where your audience is.";

const m = (id: string, role: "you" | "agent", kind: string, text: string, extra: Partial<IntakeMessage> = {}): IntakeMessage => ({ id, role, kind, text, chips: [], data: null, at: Number(id.slice(1)), ...extra });

function viewFor(state: string): IntakeView | null {
  if (state === "new") return null;
  const messages: IntakeMessage[] = [
    m("m1", "you", "text", OBJECTIVE),
    m("m2", "agent", "known", "Here's what I already know about your business.", {
      data: { items: [{ label: "What you sell", value: "Done-for-you lead generation for coaches, fixed monthly price" }, { label: "Area", value: "London, UK" }] },
    }),
    m("m3", "agent", "text", "Thanks, that's clear: you want to know why coaching clients are signing with other agencies."),
  ];
  if (state === "remember") {
    messages[1] = m("m2", "agent", "known", "Here's what I already know about your business.", { data: { items: [{ label: "What you sell", value: "Done-for-you lead generation for coaches, fixed monthly price" }] } });
    messages.push(m("m4", "agent", "question", "Which area should I look at? Your profile doesn't say yet.", { chips: ["London", "Greater London", "Manchester"] }));
    messages.push(m("m5", "you", "text", "Greater London"));
    messages.push(m("m6", "agent", "remember", 'Remember your area ("Greater London") for future sessions?', { chips: ["Yes, remember", "Just this session"], data: { factKey: "researchGeography" } }));
    messages.push(m("m7", "agent", "question", "Which other agencies do you most often lose coaching clients to? Names or websites are great.", { chips: ["I'm not sure, find them"] }));
  } else {
    messages.push(m("m4", "agent", "question", "Which other agencies do you most often lose coaching clients to? Names or websites are great.", { chips: ["I don't know any"] }));
  }
  if (state === "plan") {
    messages.push(m("m5", "you", "text", "I don't know any"));
    messages.push(m("m6", "agent", "text", "No problem, we'll find the main competitors for you."));
    messages.push(m("m7", "agent", "found", "I found 6 likely competitors. Keep, remove or add to them on the plan.", { data: { competitors: FOUND } }));
    messages.push(m("m8", "agent", "plan", "Here's the plan. Change anything by telling me, or press Start research. Nothing runs or spends until you do.", { data: { assumptions: ["Where your audience is isn't known yet, so it looks at every source it can reach."] } }));
  }
  return {
    intake: {
      id: "i1",
      status: state === "plan" ? "ready" : "chatting",
      slots: {
        objective: "Find out why we're not signing more coaching clients compared to other agencies",
        market: "Done-for-you lead generation for coaches, fixed monthly price",
        geography: state === "remember" ? "Greater London" : "London, UK",
        competitors: state === "plan" ? FOUND : [],
        competitorsUnknown: false,
        platforms: ["web", "youtube", "tiktok", "instagram", "metaAdLibrary"],
        links: [],
        origins: { objective: "you", market: "memory", geography: state === "remember" ? "you" : "memory", competitors: "found", platforms: "assumed" },
      },
      questionsAsked: state === "remember" ? 2 : 1,
      maxQuestions: 5,
      asking: state === "plan" ? null : "competitors",
      costCents: state === "plan" ? 14.3 : 0.85,
      capCents: 25,
      pendingRemember: state === "remember" ? [{ factKey: "researchGeography", label: "your area", value: "Greater London" }] : [],
      platformNote: NOTE,
      projectId: null,
    },
    messages,
  };
}

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 200));

export function IntakeChatStory({ state }: { state: string }) {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <IntakeChatView
        view={viewFor(state)}
        editor
        agentName="Strategist"
        onFirstMessage={wait}
        actions={{ send: wait, remember: wait, removeCompetitor: wait, addCompetitor: wait, setPlatforms: wait, start: wait }}
      />
    </div>
  );
}
