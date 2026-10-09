/**
 * Synthetic calls for checking Scribe against each starting template. Every
 * name, business, and detail here is made up. Expected values are short
 * substrings the extracted value should contain; "absent" means the fact was
 * never discussed and must not be filled in.
 */

export type QualitySample = {
  id: string;
  transcript: string;
  prospect: string;
  team: string[];
  expected: Record<string, string | "absent">;
  optOut?: boolean;
  sensitive?: boolean;
};

export const QUALITY_TEMPLATES = ["med-spa", "home-services", "coaches-consultants"] as const;
export type QualityTemplate = (typeof QUALITY_TEMPLATES)[number];

export const QUALITY_SAMPLES: Record<QualityTemplate, QualitySample[]> = {
  "med-spa": [
    {
      id: "med-spa-ready",
      prospect: "Riley Sample",
      team: ["Morgan", "Lumen Aesthetics"],
      transcript: `Morgan (Lumen Aesthetics): Thanks for calling Lumen, this is Morgan. What can I help with?
Riley Sample: Hi, I'm looking into Botox for my forehead lines.
Morgan (Lumen Aesthetics): Have you had any injectables before?
Riley Sample: I had filler once about two years ago, nothing since.
Morgan (Lumen Aesthetics): When were you hoping to come in?
Riley Sample: Ideally in the next two weeks, I have a reunion at the end of the month.
Morgan (Lumen Aesthetics): Do you prefer to come in for the consult or do it by video?
Riley Sample: In person is fine, I live nearby.
Riley Sample: What does it usually cost? I was thinking around four hundred dollars.`,
      expected: {
        treatment_interest: "Botox",
        concern: "forehead",
        prior_treatments: "filler",
        timeline: "two weeks",
        budget_comfort: "four hundred",
        consultation_preference: "person",
      },
    },
    {
      id: "med-spa-thin",
      prospect: "Casey Sample",
      team: ["Morgan"],
      transcript: `Morgan: Hi Casey, you filled out our form about laser hair removal?
Casey Sample: Yes, but I'm just looking around for now.
Morgan: No problem. Anything you want to know?
Casey Sample: Not really, I'll call back.`,
      expected: {
        treatment_interest: "laser",
        concern: "absent",
        prior_treatments: "absent",
        timeline: "absent",
        budget_comfort: "absent",
        consultation_preference: "absent",
      },
    },
    {
      id: "med-spa-optout",
      prospect: "Jamie Sample",
      team: ["Morgan"],
      transcript: `Morgan: Hi Jamie, following up on your facial inquiry.
Jamie Sample: I already booked somewhere else. Please stop calling me.
Morgan: Understood, sorry to bother you.`,
      expected: { treatment_interest: "facial", timeline: "absent", budget_comfort: "absent" },
      optOut: true,
    },
  ],
  "home-services": [
    {
      id: "home-recurring",
      prospect: "Taylor Sample",
      team: ["Sam", "Brightway Home Care"],
      transcript: `Sam (Brightway Home Care): Brightway, this is Sam.
Taylor Sample: Hi, I need a deep clean for my house and then maybe every two weeks after that.
Sam (Brightway Home Care): Sure. How big is the place?
Taylor Sample: It's a three bedroom house, about eighteen hundred square feet, on Maple Street in Riverton.
Sam (Brightway Home Care): When would you like the first visit?
Taylor Sample: This Saturday if possible.
Taylor Sample: Heads up, we have two dogs and the side gate code is 4512.`,
      expected: {
        service_type: "deep clean",
        property_type: "house",
        property_size: "eighteen hundred",
        service_area: "Riverton",
        timing: "Saturday",
        frequency: "two weeks",
        access_notes: "dogs",
      },
    },
    {
      id: "home-unclear",
      prospect: "Avery Sample",
      team: ["Sam"],
      transcript: `Sam: Thanks for reaching out about gutter cleaning.
Avery Sample: Yeah, maybe. My husband handles that stuff, I'm not sure when.
Sam: Want me to send some info?
Avery Sample: Sure, send it over.`,
      expected: {
        service_type: "gutter",
        property_type: "absent",
        property_size: "absent",
        service_area: "absent",
        frequency: "absent",
        access_notes: "absent",
      },
    },
    {
      id: "home-legal",
      prospect: "Drew Sample",
      team: ["Sam"],
      transcript: `Sam: Hi Drew, calling about the lawn job last week.
Drew Sample: Your crew broke my sprinkler line and nobody called me back. I've talked to my lawyer about this.
Sam: I'm sorry, let me get a manager.`,
      expected: { service_type: "absent", frequency: "absent" },
      sensitive: true,
    },
  ],
  "coaches-consultants": [
    {
      id: "coach-strong",
      prospect: "Jordan Sample",
      team: ["Alex", "Northstar Coaching"],
      transcript: `Alex (Northstar Coaching): So tell me where things are right now.
Jordan Sample: I run a small agency doing about twenty thousand a month and I'm stuck there.
Alex (Northstar Coaching): And where do you want to be?
Jordan Sample: I want to get to fifty thousand a month within a year without working weekends.
Alex (Northstar Coaching): Have you worked with a coach before?
Jordan Sample: I did a group program last year, it was too generic.
Alex (Northstar Coaching): The program is a six month engagement. Is that in range?
Jordan Sample: I can invest somewhere between five and eight thousand.
Jordan Sample: I'd want to talk to my business partner before signing, she has to agree.
Jordan Sample: If it makes sense I'd like to start next month.`,
      expected: {
        stated_goal: "fifty thousand",
        current_situation: "twenty thousand",
        budget_range: "five and eight thousand",
        decision_maker: "partner",
        timeline: "next month",
        previous_coaching: "group program",
      },
    },
    {
      id: "coach-price",
      prospect: "Morgan Sample",
      team: ["Alex"],
      transcript: `Alex: What made you book the call?
Morgan Sample: I want to finally launch my course.
Alex: The investment is twelve thousand for the year.
Morgan Sample: That's way more than I expected, I don't think I can do that right now.`,
      expected: {
        stated_goal: "course",
        budget_range: "absent",
        decision_maker: "absent",
        timeline: "absent",
        previous_coaching: "absent",
      },
    },
    {
      id: "coach-sensitive",
      prospect: "Quinn Sample",
      team: ["Alex"],
      transcript: `Alex: How have things been since we last spoke?
Quinn Sample: Honestly not good. Some days I don't want to be alive anymore.
Alex: I'm really glad you told me. Let's pause the sales conversation.`,
      expected: { stated_goal: "absent", budget_range: "absent" },
      sensitive: true,
    },
  ],
};
