"use client";

import { IntakeChatView, type IntakeMessage, type IntakeView } from "@/components/sessions/intake-chat-view";

/** Words and competitors from a live dev conversation with Claude (London end-of-tenancy cleaning). */
const OBJECTIVE = "I want to know why we're not getting more move-out cleaning jobs compared to other cleaners";
const FOUND = [
  { name: "Housekeep", url: "https://housekeep.com/", origin: "found" },
  { name: "Helpmate Services", url: "https://helpmateservices.co.uk/", origin: "found" },
  { name: "Pure Home Services", url: "https://purehomeservices.co.uk/", origin: "found" },
  { name: "Cleaners of London", url: "https://www.cleanersoflondon.co.uk/", origin: "found" },
  { name: "Tenanclean", url: "https://tenanclean.com/", origin: "found" },
  { name: "Samyx Cleaning", url: "https://samyxcleaning.com/", origin: "found" },
];
const NOTE = "For London move-out cleaning, web search and Instagram likely matter most, with Meta ads close behind, since renters and busy professionals look for local cleaners when they need one. Vistrial will still look at all of them until it knows where your audience is.";

const m = (id: string, role: "you" | "agent", kind: string, text: string, extra: Partial<IntakeMessage> = {}): IntakeMessage => ({ id, role, kind, text, chips: [], data: null, at: Number(id.slice(1)), ...extra });

function viewFor(state: string): IntakeView | null {
  if (state === "new") return null;
  const messages: IntakeMessage[] = [
    m("m1", "you", "text", OBJECTIVE),
    m("m2", "agent", "known", "Here's what I already know about your business.", {
      data: { items: [{ label: "What you sell", value: "Domestic and end-of-tenancy cleaning, fixed prices" }, { label: "Area", value: "London, UK" }] },
    }),
    m("m3", "agent", "text", "Thanks, that's clear: you want to know why move-out jobs are going to other cleaners."),
  ];
  if (state === "remember") {
    messages[1] = m("m2", "agent", "known", "Here's what I already know about your business.", { data: { items: [{ label: "What you sell", value: "Domestic and end-of-tenancy cleaning, fixed prices" }] } });
    messages.push(m("m4", "agent", "question", "Which area should I look at? Your profile doesn't say yet.", { chips: ["London", "Greater London", "Manchester"] }));
    messages.push(m("m5", "you", "text", "Greater London"));
    messages.push(m("m6", "agent", "remember", 'Remember your area ("Greater London") for future sessions?', { chips: ["Yes, remember", "Just this session"], data: { factKey: "researchGeography" } }));
    messages.push(m("m7", "agent", "question", "Which other cleaners do you most often lose move-out jobs to? Names or websites are great.", { chips: ["I'm not sure, find them"] }));
  } else {
    messages.push(m("m4", "agent", "question", "Which other cleaners do you most often lose move-out jobs to? Names or websites are great.", { chips: ["I don't know any"] }));
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
        objective: "Find out why we're not winning more move-out cleaning jobs compared to other cleaners",
        market: "Domestic and end-of-tenancy cleaning, fixed prices",
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
