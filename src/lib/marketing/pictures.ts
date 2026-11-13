/**
 * The real app screens shown on the public page, and the words around them. Every factual statement
 * here is true of the product today; the screens show sample data and say so.
 */

/** The words on the live parts that show the app. */
export const APP_SCREENS = {
  id: "app",
  eyebrow: "Inside Vistrial",
  headline: "Where the work shows up.",
  lead: "Agents propose the work. You see what each piece is expected to return, what it may cost in credits, and the evidence behind it, and you approve.",
  agent: "Growth Architect",
  app: "Vistrial",
  tourLabel: "Screens from the app",
  /** Above the three pictures of a skill's finished work. */
  skillsTitle: "What the skills hand back",
  skillsLead: "Three finished pieces, as they look in the app.",
  /** Above the two pictures that go with the loop. */
  loopTitle: "The same loop, in the app",
} as const;

/**
 * Product pictures. Every picture is a real screen from the app, cut from a dev story with sample data
 * by scripts/capture-landing-pictures.cjs, in the white theme only. To add one, add its story to that
 * script and an entry here. Never show a mock-up, and switch a picture off rather than fake a screen.
 */
export type Picture = {
  id: string;
  on: boolean;
  /** Where the picture sits: with a skill's work, in the tour of the app, or with the loop. */
  place: "skill" | "app" | "loop";
  file: string | null;
  width: number;
  height: number;
  title: string;
  alt: string;
  /** On a phone a picture is shown larger and cut at the right edge. "fit" shows the whole width, for a screen whose content is centred. */
  phone?: "fit";
  /** The skill that made the screen, or the part of the app it is. Shown in the picture's header. */
  by: string;
  /** For the screens in the tour: the tab's short name, and what the agents do on that screen. */
  tab?: string;
  doing?: string;
};

export const PICTURES: Picture[] = [
  {
    id: "offer-compare",
    on: true,
    by: "Offer Intelligence",
    place: "skill",
    file: "offer-compare",
    width: 1604,
    height: 918,
    title: "Your offer beside theirs",
    alt: "The Offers screen: a table comparing your offer with three competing agencies on what they lead with, price and guarantee. The guarantee cell for your offer is highlighted as not stated, and each competitor column links to its source.",
  },
  {
    id: "ad-set",
    on: true,
    by: "Creative Production",
    place: "skill",
    file: "ad-set",
    width: 2236,
    height: 1304,
    title: "Four variations for a client brand",
    alt: "The Creative screen: four ad copy variations for one client brand, each with its headline, button, image direction and an untested hypothesis to check.",
  },
  {
    id: "page-teardown",
    on: true,
    by: "Landing Page Teardown",
    place: "skill",
    file: "page-teardown",
    width: 2236,
    height: 1822,
    title: "Your page, section by section",
    alt: "The Pages screen: a landing page read section by section, with counts of its buttons and header links, its qualifier, headline, proof and offer, and a note on whether each section does its job.",
  },
  {
    id: "tasks-board",
    on: true,
    by: "Tasks",
    tab: "Tasks",
    doing: "Proposes work and ranks it by expected return",
    place: "app",
    file: "tasks-board",
    width: 1924,
    height: 1634,
    title: "Tasks: proposed work, ranked",
    alt: "The Tasks board with three columns: Proposed, Approved and Running. Each card names the work, the client it is for, the expected return as a range marked Your data or Inference, the credit cost, and its evidence. Proposed cards have Approve, Edit and Skip buttons.",
  },
  {
    id: "briefing-approval",
    on: true,
    by: "Briefing",
    tab: "Briefing",
    doing: "Asks before it runs anything",
    place: "app",
    file: "briefing-approval",
    width: 1412,
    height: 522,
    title: "Briefing: approve where you read",
    alt: "A Briefing post from Growth Architect for a client: a proposed task with its reason, marked as needing approval because an agent wants to run it, with Approve and Decline buttons.",
  },
  {
    id: "home",
    on: true,
    by: "Home",
    tab: "Home",
    doing: "Lists what needs you, and what changed",
    place: "app",
    file: "home",
    width: 1528,
    height: 3264,
    title: "Home: what needs you",
    phone: "fit",
    alt: "The Home screen: a box asking what Vistrial should work on, then a Needs you list with a question from an agent, approvals and a check-in that is due, then what changed since you were last here.",
  },
  {
    id: "organizations-clients",
    on: true,
    by: "Clients",
    tab: "Clients",
    doing: "Keeps each client's work with that client",
    place: "app",
    file: "organizations-clients",
    width: 2336,
    height: 2294,
    title: "Clients, and who can see each one",
    alt: "The Clients screen for an agency: a list of client businesses and people, one client's profile with what they sell and who they sell to, and a list of team members showing who can see that client.",
  },
  {
    id: "test-plan",
    on: true,
    by: "Test plan",
    place: "loop",
    file: "test-plan",
    width: 1604,
    height: 1286,
    title: "Pick a change, set a check-in",
    alt: "A test plan with two changes. The first is being tried, with a check-in date and starting figures saved. The second has a We'll try this button and a check-back choice of 30 days.",
  },
  {
    id: "tasks-result",
    on: true,
    by: "Tasks",
    place: "loop",
    file: "tasks-result",
    width: 828,
    height: 1244,
    title: "Result: what was measured",
    alt: "The Result column of the Tasks board: two changes with what was measured at the check-in. One is marked It helped, with bookings up from 24 to 31. The other is marked No clear change. Each shows what was expected beforehand.",
  },
];

export function picturesFor(place: Picture["place"]) {
  return PICTURES.filter((picture) => picture.on && picture.place === place && picture.file);
}

export const PICTURE_NOTE = "A real screen from the app, with sample data.";
