import { COMPANY_ADDRESS, LEGAL_ENTITY } from "@/lib/constants";
import { formatTrustDate, type TrustPublic } from "@/lib/trust/model";

/**
 * Public privacy policy for the current product (Strategist). A sentence
 * is included only when the product does that thing today. Switch lines stay
 * out until a Platform Admin confirms the setting and turns them on.
 */

export type PolicyBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "h"; text: string }
  | { kind: "note"; text: string };

export type PolicySection = {
  id: string;
  number: string;
  title: string;
  blocks: PolicyBlock[];
};

export function privacyEntity(trust: TrustPublic): string {
  const named = trust.legalEntity?.trim();
  return named || LEGAL_ENTITY;
}

export function privacyDates(trust: TrustPublic): { updated: string; effective: string } {
  const updated = formatTrustDate(trust.privacyUpdatedOn);
  return { updated, effective: trust.privacyLive ? updated : "Not in effect" };
}

export function privacyPolicySections(trust: TrustPublic): PolicySection[] {
  const entity = privacyEntity(trust);
  const email = trust.privacyEmail;
  const address = trust.mailingAddress?.trim() || COMPANY_ADDRESS;
  const addressLine = `Mailing address: ${address}.`;

  const ai: string[] = [
    "Agents work only inside the workspace they belong to.",
    "Text found in public sources, and text in files you upload, is treated as information to read, not as instructions to follow.",
    "Agents cannot publish, post, send, or spend anything. A person on the customer team reviews and approves the work, and publishing happens outside Vistrial.",
    "Every claim in a report is labeled as observed, inferred, a hypothesis, or backed by the customer's own results, with its source. When there is not enough data, the report says so.",
    "AI output can be wrong. Teams should review it before approving or using it.",
  ];
  if (trust.switches.aiNoTraining) {
    ai.push(
      "Customer workspace information is not used to train those providers' models. This line is included because a Platform Admin confirmed the provider setting.",
    );
  }

  const protection: string[] = [
    "Separate workspaces. Customers are separated from each other, and the separation is enforced on the server for every request, not only on screen.",
    "Role-based access. People see only what their role allows.",
    "Audit trail. Important actions, such as approvals and staff actions that change a workspace, are recorded.",
    "Cost limits. Every research run has a cost limit, and the cost is shown as it runs.",
    "The website and the application are served over HTTPS. Browsers are told to stay on HTTPS.",
  ];
  if (trust.switches.encryptionAtRest) {
    protection.push("Stored data is encrypted at rest. This line is included because a Platform Admin confirmed the provider setting.");
  }
  if (trust.switches.staffMfa) {
    protection.push("Multi-factor sign-in is required for Vistrial staff. This line is included because a Platform Admin confirmed the live setting.");
  }

  const retention: string[] = [
    "Account and workspace information, including research, reports, drafts, and uploaded files, is kept while the workspace is active.",
    "Earlier versions of a report or draft are kept with it, so a team can see what changed. Versions are not overwritten.",
    "Information you send us through our website or by email is kept as long as we need it to respond to you and to manage our relationship with you.",
    "Uploaded results files are deleted as soon as they are read. Only their totals are kept.",
    "A connected Meta ad account's token and saved results are deleted as soon as the account is disconnected.",
    "A connected calendar's access and saved counts are deleted as soon as the calendar is disconnected.",
    "A connected HighLevel sub-account's access and everything read from it are deleted as soon as it is disconnected, or when the Vistrial app is uninstalled in HighLevel. While it stays connected, activity facts are kept for 90 days, leads for as long as they are linked to a kept deal or were added in the last 90 days, and closed deals for a year after their last change. A connection HighLevel stops accepting is deleted with its data 30 days later unless an Owner reconnects it.",
    "A call transcript you add is kept until someone in the workspace deletes it, or the workspace is deleted.",
    "Vistrial does not currently delete workspace information on an automatic schedule, apart from the connected HighLevel information described above. When a customer asks us to delete information, we verify the request and a person carries it out.",
  ];
  if (trust.switches.backups) {
    retention.push(
      "Backups are taken and a restore has been tested. A deleted copy can remain in a backup until that backup is overwritten. This line is included because a Platform Admin confirmed it.",
    );
  }

  return [
    {
      id: "short-version",
      number: "1",
      title: "The short version",
      blocks: [
        {
          kind: "ul",
          items: [
            "Vistrial is an agentic workforce for business growth. Our first agent, Strategist, researches a business's market from public sources and the business's own results, then prepares reports, strategy, and creative drafts for a person to review.",
            "If you visit our website or ask for access, we collect only what we need to respond to you.",
            "If you are a customer, the information in your workspace belongs to you. We handle it on your behalf to provide the service.",
            "Research uses official access only: public web pages, official platform APIs, and links you provide. Vistrial does not log in to a platform for you or get around blocks.",
            "Nothing is published, posted, or sent by Vistrial. A person on your team approves the work, and you decide what to use.",
            "We use a small number of service providers to run Vistrial. Section 6 names them.",
            "You can ask us to export, correct, or delete your information. Section 12 explains how.",
            `Questions? Email ${email}.`,
          ],
        },
      ],
    },
    {
      id: "who-we-are",
      number: "2",
      title: "Who we are and when this policy applies",
      blocks: [
        {
          kind: "p",
          text: `The operator is ${entity} ("Vistrial," "we," "us," or "our"). We are based in Maryland, United States. ${addressLine}`,
        },
        { kind: "p", text: "This policy covers:" },
        {
          kind: "ul",
          items: [
            "Our public website and its forms.",
            "The Vistrial application, including accounts, workspaces, and agents.",
            "Our communications with you, such as email and support replies.",
          ],
        },
        { kind: "p", text: "We act in two different roles, and the difference matters:" },
        {
          kind: "p",
          text: "Our own information. For visitors, people who request access, account holders, and people who contact us, we decide why and how the information is used. This policy describes those uses.",
        },
        {
          kind: "p",
          text: "Customer workspace information. A Vistrial customer tells Strategist what to research and brings in its own information, such as its business profile, competitors, results files, and lead lists. The customer decides what to bring in and how it is used. We process that information for the customer, to provide the service, and follow the customer's instructions and our agreement with them. If you are a lead or contact of a customer, Section 13 explains your options.",
        },
      ],
    },
    {
      id: "information-we-collect",
      number: "3",
      title: "Information we collect",
      blocks: [
        { kind: "h", text: "A. When you visit our website" },
        {
          kind: "ul",
          items: [
            "Basic technical information your browser sends automatically, such as IP address, browser type, device type, pages viewed, referring page, and the date and time of your visit.",
            "Information needed to keep the site secure, such as records of unusual or abusive traffic and the result of a bot check on our forms.",
            "Your choice about optional cookies, described in Section 8.",
          ],
        },
        { kind: "h", text: "B. When you request access or contact us" },
        {
          kind: "ul",
          items: [
            "Name, work email address, business name, website, and the details you choose to give us in the form, such as your type of business, team size, the tools you use, and what you need.",
            "For data requests: the details needed to verify and fulfil the request.",
            "Records of our replies and the status of your request.",
          ],
        },
        { kind: "h", text: "C. When you create or use an account" },
        {
          kind: "ul",
          items: [
            "Name, email address, role in your workspace, and sign-in information. Sign-in is handled by our sign-in provider. Passwords are not stored by Vistrial in readable form.",
            "Settings and preferences.",
            "Information about how you use the product, such as actions taken (for example approvals) and security events. We keep an audit trail of important actions.",
          ],
        },
        { kind: "h", text: "D. Customer workspace information" },
        {
          kind: "p",
          text: "A customer workspace holds the information the customer enters or uploads, and the work Strategist prepares from it. This can include:",
        },
        {
          kind: "ul",
          items: [
            "The business profile: what the business sells, where, to whom, its offers, and its competitors.",
            "Research assignments: the questions, markets, keywords, competitors, and links the team asks Strategist to look at.",
            "Files the team uploads, such as the business's own ad or sales results. A results file is read once and deleted; only totals by date and by campaign or channel are kept. Columns that name a person or how to reach them, such as names, email addresses, phone numbers and street addresses, are skipped without being read.",
            "Results from accounts the team connects, such as Meta ad results, booked-call counts from a calendar, and sales pipeline and lead information from HighLevel, described in parts I, J and L below.",
            "Call transcripts the team uploads or pastes, described in part K below.",
            "Decisions about recommendations: which recommendations the team chose to try, when to check back, what the team says happened, and the business's own figures before and after.",
            "Lead lists the team imports, such as names, email addresses, phone numbers, and activity dates, and notes the team adds.",
            "Research runs: the steps an agent took, the sources it checked, whether each source was available, and the cost of the run.",
            "Reports, strategy, ad copy, scripts, briefs, and other drafts, with their versions and who approved them.",
          ],
        },
        { kind: "h", text: "E. Information from public sources" },
        {
          kind: "p",
          text: "To research a market, Strategist reads public sources: public web pages, YouTube through its official API, the Meta Ad Library through Meta's official API where it is available, and TikTok and Instagram posts the team provides or the research finds, through the platforms' public link previews. From these, Vistrial stores links, titles, publishers, dates, short text excerpts, and the facts drawn from them, such as which offers an advertiser leads with and how long an ad has run. It does not store copies of ad images or video files. Some posts are shown through the platform's own embedded player.",
        },
        {
          kind: "p",
          text: "Public sources can name businesses and people, such as advertisers, creators, and reviewers. Section 14 explains your options if that includes you.",
        },
        { kind: "h", text: "F. Payments" },
        {
          kind: "p",
          text: "Vistrial sells a monthly plan that includes credits, and packs of extra credits. Credits pay for the AI work agents do; each piece of work is charged from the balance. Payment is taken by Stripe on its own checkout page, through our billing provider Autumn, and cards, invoices and cancelling are managed on Stripe's page. Vistrial does not see or store a full card number. We keep a customer reference, the plan, whether automatic top-up is on, the credit balance, and a record of each charge: which piece of work it paid for, what it cost us, and what it cost you.",
        },
        { kind: "h", text: "G. Support and communications" },
        { kind: "p", text: "Messages you send us, our replies, and information you share to get help." },
        { kind: "h", text: "H. Information created by our AI features" },
        {
          kind: "p",
          text: "Reports, summaries, drafts, and answers that our agents prepare from the customer's workspace information and from public sources. These belong with the workspace they were created for.",
        },
        { kind: "h", text: "I. Connected Meta ad accounts" },
        {
          kind: "p",
          text: "If a workspace Owner connects a Meta ad account, Vistrial reads that account's campaigns and results with read-only access: campaign names, status and objective, spend, impressions, reach, clicks, and the results Meta reports, such as leads, with their cost. Vistrial never creates, edits, pauses or pays for ads. The access token Meta issues is kept on our servers and is never shown in the app. These results are used only for the workspace that connected them, shown to its team and cited in its reports as the business's own data.",
        },
        {
          kind: "p",
          text: "Disconnecting the account in Connections deletes the token and every saved read straight away. You can also remove Vistrial from your Facebook settings, under Business Integrations.",
        },
        { kind: "h", text: "J. Connected calendars" },
        {
          kind: "p",
          text: "If a workspace Owner connects Google Calendar or Calendly, Vistrial reads that person's scheduled events with read-only access, to count booked calls. From Google Calendar it asks only for each event's time, type, cancelled status, and its guests' email addresses and replies, and uses the email addresses once, in passing, to tell an outside guest from a colleague. From Calendly it reads each event's time, event type name and cancelled status, and whether the host marked an invitee as a no-show. Vistrial keeps counts only: how many calls were booked, cancelled, declined or marked no-show each week, and for Calendly by event type. It does not keep event titles, descriptions, locations, or the names or email addresses of guests and invitees. Vistrial never creates, changes or cancels events and never contacts guests.",
        },
        {
          kind: "p",
          text: "The access token is kept on our servers and is never shown in the app. Disconnecting the calendar in Connections deletes the token and every saved count straight away, and asks the provider to cancel the token. You can also remove Vistrial in your Google Account under third-party connections, or in Calendly under integrations.",
        },
        {
          kind: "p",
          text: "Vistrial's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Information from Google Calendar is used only to show the workspace its own booked-call counts and to cite them in that workspace's reports. It is not sold and not used for advertising.",
        },
        { kind: "h", text: "K. Call transcripts" },
        {
          kind: "p",
          text: "An Owner, Admin or Member of an organization can upload or paste the transcript of a call they recorded with a note-taking tool. Vistrial keeps the transcript's text, the title and call date the person gives it, the name of the tool, who added it, and when that person confirmed the call was recorded lawfully. Vistrial takes text only and does not accept audio or video. A transcript contains the names and words of the people on the call. It is stored for that workspace only, shown to its Owners, Admins and Members, and read by the agents the Owner allows, to prepare that workspace's reports; a report may quote up to 300 characters of it as a source.",
        },
        {
          kind: "p",
          text: "The customer who recorded the call is responsible for having told everyone on it, and for having their agreement where the law requires it, before recording. An Owner, Admin or Member can delete a transcript at any time, which deletes its text. If you were on a call with a Vistrial customer and want its transcript removed, contact that business; Section 13 explains how we help.",
        },
        { kind: "h", text: "L. Connected HighLevel accounts" },
        {
          kind: "p",
          text: "If a workspace Owner connects a HighLevel (also called LeadConnector) sub-account, for the organization or for one of its clients, Vistrial reads it with read-only access. It reads the sales pipelines and their stages; each deal's stage, status, value, source and dates, but not the deal's name, notes or custom fields; the business's leads; and what happened to them: calls, text messages, emails, chats and appointments. It does not change anything in HighLevel unless an Owner of the workspace allows it, as the next paragraphs describe.",
        },
        {
          kind: "p",
          text: "If an Owner allows it, Vistrial may also act in the connected sub-account: move a deal to another stage, mark a deal won, lost or abandoned, add or remove a tag on a lead, add a note to a lead, or create a task. An agent or a person on the team proposes each change, and nothing changes in HighLevel until an Owner or Admin approves that one change; marking a deal won, lost or abandoned needs an Owner. Each change is recorded with who proposed it, who approved it and when, and what HighLevel answered. An Owner can turn this off for one account or for the whole organization at any time, which cancels everything still waiting. Vistrial never deletes anything in HighLevel. A change can start an automation the business set up in HighLevel, which may contact the lead; that automation is the business's own.",
        },
        {
          kind: "p",
          text: "Messaging leads is separate and off unless an Owner turns it on, confirming that the business has its leads' consent to be texted and emailed. The business is responsible for that consent and for honouring opt-outs, as laws such as the US Telephone Consumer Protection Act and CAN-SPAM require. Each text or email is approved by an Owner before it is sent. Just before sending, Vistrial reads the lead again from HighLevel and does not send if the lead has opted out or is on Do Not Disturb, if it is between 8 pm and 8 am in the lead's time zone or that time zone is unknown, or if Vistrial messaged the lead in the last day. Vistrial keeps the message it sent, who approved it, and what those checks found, while the account stays connected. If you are a lead and do not want messages, reply STOP or ask the business to stop contacting you.",
        },
        {
          kind: "p",
          text: "This includes personal information about the business's own leads and customers. For each lead, Vistrial keeps only the name, email address, phone number, where the lead came from, up to ten tags, and when the lead was added. For activity it keeps facts only: the kind, when it happened, whether it was inbound or outbound, a call's length and outcome, an appointment's status, and a deal's move from one stage to another. It does not keep what a message said, email subjects, call recordings or transcripts, notes, attachments, addresses, or dates of birth.",
        },
        {
          kind: "p",
          text: "Vistrial keeps this information to show the workspace how its sales process is doing, so an agent can help the business convert more of its leads, and to propose the changes described above. A note, task or message Vistrial adds is kept in its record of that change while the account stays connected. It is stored for that workspace only. If the connection is for a client, only the people in the workspace who may see that client can see it. Vistrial handles this information on the business's behalf, as Section 13 describes; the business is responsible for having collected it lawfully.",
        },
        {
          kind: "p",
          text: "The access tokens HighLevel issues are kept on our servers and are never shown in the app. Disconnecting the sub-account in Connections deletes the tokens and everything read from it. Uninstalling the Vistrial app in HighLevel does the same, and also ends Vistrial's access in HighLevel.",
        },
      ],
    },
    {
      id: "how-we-use-information",
      number: "4",
      title: "How we use information",
      blocks: [
        { kind: "p", text: "We use information to:" },
        {
          kind: "ul",
          items: [
            "Provide, run, and maintain the service, including running research and preparing reports and drafts for the right people in a workspace.",
            "Create and manage accounts, roles, and invitations.",
            "Send notices you need or asked for, such as account and security notices.",
            "Respond to access requests, support requests, and data requests.",
            "Keep the service secure, prevent abuse and fraud, and investigate problems.",
            "Meet legal obligations and enforce our terms.",
            "Understand how the product is used so we can fix problems and improve it, using aggregated or de-identified information wherever practical.",
            "Learn which kinds of recommendations work. When a team records what happened after trying a recommendation, we keep a separate de-identified record: the type of business in a few words, the recommendation, the result, how long it took, and changes as percentages. It does not include the workspace, the business's name or location, amounts, or anything the team wrote. Only Vistrial uses it; it is never shown to other customers. Deleting the decision deletes this record.",
          ],
        },
        { kind: "p", text: "We do not use the contents of a customer workspace for advertising." },
      ],
    },
    {
      id: "your-control",
      number: "5",
      title: "What stays under your control inside a workspace",
      blocks: [
        {
          kind: "ul",
          items: [
            "Strategist prepares work for review. It does not publish, post, send, or charge anything to an ad account. A person approves the work, and you decide what to use.",
            "You choose what Strategist researches, and every run has a cost limit.",
            "Collection from public ad libraries stays off until a workspace Owner accepts the risk in writing.",
            "Only the people invited into a workspace can see it, and what each person sees depends on their role. Important actions, including staff actions that change a workspace, are recorded.",
          ],
        },
      ],
    },
    {
      id: "how-we-share",
      number: "6",
      title: "How we share information",
      blocks: [
        { kind: "p", text: "We share information only in these ways:" },
        {
          kind: "p",
          text: "Service providers. We use companies that host, store, and process information on our behalf. They may use it only to provide their service to us. Today they are:",
        },
        {
          kind: "ul",
          items: [
            "Vercel, which hosts the website and the application.",
            "Convex, which stores the application's data.",
            "Clerk, which handles sign-in and accounts.",
            "Anthropic, which provides the Claude AI models our agents use, including their web search and web page reading.",
            "Google, which provides the AI models that make ad images and read reference videos, and, when someone on your team chooses a Gemini model, the model that does that piece of work.",
            "OpenRouter, which passes a piece of work to the AI model someone on your team chose when that model is a GPT or Gemini model, and passes requests for ad images when they are made that way.",
            "Microsoft, whose Azure service runs OpenAI's GPT models for us when someone on your team chooses a GPT model.",
            "OpenAI, which makes the picture when someone on your team chooses its image model for an ad image.",
            "Cloudflare, which runs the bot check on our public forms when it is switched on.",
            "Resend, which delivers the email that tells our team a website form was submitted.",
            "Autumn, which runs our plans, credit balances and top-ups.",
            "Stripe, which takes payments and manages cards and invoices. Card details go to Stripe, not to Vistrial.",
          ],
        },
        {
          kind: "p",
          text: "Platforms we read from. When Strategist researches a market, it sends search terms and links to Google (for YouTube) and Meta (for the Meta Ad Library), and requests public link previews from platforms such as TikTok and Instagram. It sends what is needed to find public content, not the contents of your workspace.",
        },
        {
          kind: "p",
          text: "Accounts you connect. When a workspace connects an account such as Meta ads, a calendar or HighLevel (LeadConnector), Vistrial sends that provider only the requests needed to read it. HighLevel is the customer's own provider, not a service provider of Vistrial; what Vistrial reads from it is stored with Convex, listed above.",
        },
        {
          kind: "p",
          text: "These companies may process information in the United States and in other countries where they operate.",
        },
        { kind: "p", text: "Within a workspace. Information is visible to people the customer has invited, according to their role." },
        {
          kind: "p",
          text: "Legal reasons. We may disclose information if we believe the law requires it, to respond to valid legal process, to protect rights, safety, and security, or to investigate misuse.",
        },
        {
          kind: "p",
          text: "Business changes. If Vistrial is involved in a merger, acquisition, financing, or sale of assets, information may be transferred as part of that transaction. We will tell affected customers if this changes how their information is handled.",
        },
        { kind: "p", text: "With your consent or at your direction." },
        {
          kind: "p",
          text: "Aggregated or de-identified information. We may use or share information that has been aggregated or de-identified so it cannot reasonably be used to identify a person or a workspace.",
        },
        {
          kind: "p",
          text: "We do not sell the information in customer workspaces, and we do not use it for advertising.",
        },
        {
          kind: "p",
          text: "The public website does not send visit information to advertising platforms. Optional page counts are described in Section 8.",
        },
      ],
    },
    {
      id: "ai-features",
      number: "7",
      title: "How our AI features use information",
      blocks: [
        {
          kind: "p",
          text: "Vistrial uses AI to research, sort, and write inside a customer workspace. When an agent runs, the relevant workspace information and the public sources it found are sent to the AI model that does the work. Unless someone on your team chooses otherwise, that is a Claude model from Anthropic, and web searches and web page reading for research also run through Anthropic.",
        },
        {
          kind: "p",
          text: "A person who starts a piece of work can choose a GPT model or a Gemini model for it. Their choice is remembered and used for their next work of the same kind until they change it. That work is sent through OpenRouter to the company that runs the model: Microsoft Azure for GPT models, Google Cloud for Gemini models. With every request we tell OpenRouter to use only companies on its zero data retention list that do not collect the content, and the request fails if none is available. A web search made by one of these models runs on that company's own search service. Each result in Vistrial shows which model made it.",
        },
        {
          kind: "p",
          text: "Google Cloud is on that list with one exception we want you to know about: Google may keep the requests and answers of Gemini work for a time, only to detect and prevent abuse. OpenRouter keeps a record of each request's size, timing and cost, not its content, unless the content is flagged as possible child sexual abuse material.",
        },
        {
          kind: "p",
          text: "Ad images are made by Google's image models unless the person making them chooses OpenAI's image model. An image request holds the description of the picture, and for a designed ad the words of the ad and pictures of your own past ads from your brand kit. Requests to Google go to Google directly or through OpenRouter to Google Cloud. Requests to OpenAI's image model go through OpenRouter to OpenAI. OpenAI is not on the zero data retention list for image requests, so it may keep such a request for a time under its own terms. Reference videos you add are read by a Google model.",
        },
        { kind: "ul", items: ai },
      ],
    },
    {
      id: "cookies",
      number: "8",
      title: "Cookies and similar technology",
      blocks: [
        { kind: "p", text: "Our website and application use cookies and similar technology for these purposes:" },
        {
          kind: "ul",
          items: [
            "Essential: keeping you signed in, protecting against abuse, and remembering your cookie choice. The application cannot work without these.",
            "Analytics, off until you allow it: our own count of public page visits, kept as daily totals. It records the page and the type of event, not your name, email, or form answers.",
            "We do not currently use Google Analytics or the Meta pixel. If we turn either on, we will update this policy first, and it will stay off until you allow that category.",
          ],
        },
        {
          kind: "p",
          text: "Optional tools run only on the public website, and only after you allow them. They are not used inside the Vistrial application. The older booking calendar on /book is provided by GoHighLevel and does not load until you open it. Details are on /cookies.",
        },
        {
          kind: "p",
          text: "You can change your choice at any time from the cookie preferences link on our website, or at /cookies. If your browser sends a Global Privacy Control signal, we keep optional tools off unless you deliberately turn a category on. Blocking essential cookies may stop parts of the service from working. We do not currently respond to Do Not Track signals other than as described here.",
        },
      ],
    },
    {
      id: "email",
      number: "9",
      title: "Email from us",
      blocks: [
        {
          kind: "p",
          text: "We send service email: sign-in and account messages, invitations, security notices, data request updates, and replies to your requests. You cannot turn off account and security notices because they are required to run your account.",
        },
        { kind: "p", text: "Vistrial does not send a separate product newsletter." },
      ],
    },
    {
      id: "how-long",
      number: "10",
      title: "How long we keep information",
      blocks: [
        {
          kind: "p",
          text: "We keep information only as long as needed for the purposes in this policy, then delete or de-identify it:",
        },
        { kind: "ul", items: retention },
      ],
    },
    {
      id: "how-we-protect",
      number: "11",
      title: "How we protect information",
      blocks: [
        { kind: "p", text: "We use measures designed to protect information, including:" },
        { kind: "ul", items: protection },
        {
          kind: "p",
          text: "No method of transmission or storage is perfectly secure, and we cannot guarantee absolute security. Vistrial is not currently certified under SOC 2, ISO 27001, or a similar standard. More detail is on our Security page at /security.",
        },
      ],
    },
    {
      id: "your-choices",
      number: "12",
      title: "Your choices and rights",
      blocks: [
        { kind: "p", text: "Everyone can ask us to:" },
        {
          kind: "ul",
          items: [
            "Tell you what personal information we hold about you.",
            "Correct information that is wrong.",
            "Delete information, where we are able to.",
            "Provide a copy of the information you gave us.",
            "Stop a message that is not required to run the account.",
          ],
        },
        { kind: "p", text: "Workspace Owners can also ask us to:" },
        {
          kind: "ul",
          items: ["Export their workspace data.", "Delete uploaded files or imported lists.", "Delete the workspace."],
        },
        {
          kind: "p",
          text: `How to ask. Use the data requests page at /privacy/requests, or email ${email}. We verify your identity before acting, because we do not want to give your information to the wrong person. We aim to respond within 30 days. We will tell you if we cannot fulfil a request and why.`,
        },
        { kind: "p", text: "You will not be treated worse for making a request." },
      ],
    },
    {
      id: "leads-and-contacts",
      number: "13",
      title: "If you are a lead or contact of a Vistrial customer",
      blocks: [
        {
          kind: "p",
          text: "A customer can import its own lead lists into Vistrial, or connect its HighLevel account so Vistrial reads its leads and their activity, as part L of Section 5 describes. If a business has your information in Vistrial, the business decides what to keep and how to use it. Vistrial handles that information on the business's behalf and does not contact you.",
        },
        {
          kind: "p",
          text: `If you want to see, correct, or delete your information, the fastest route is to contact the business directly. You can also email ${email}, tell us which business you mean, and we will pass your request to that business. We may not be able to act on the request ourselves without the customer's direction, but we will tell you what happens next.`,
        },
      ],
    },
    {
      id: "public-sources",
      number: "14",
      title: "If you appear in public content we researched",
      blocks: [
        {
          kind: "p",
          text: "Strategist reads content that is already public, such as ads in the Meta Ad Library, public videos and posts, and public web pages. A research report can mention the business or person who published that content and link to it. Vistrial does not log in to see private content, does not get around blocks, and does not store copies of images or videos.",
        },
        {
          kind: "p",
          text: `If you want a link or excerpt about you removed from a report, email ${email} with the link, and we will review it with the customer whose workspace holds it.`,
        },
      ],
    },
    {
      id: "children",
      number: "15",
      title: "Children",
      blocks: [
        {
          kind: "p",
          text: `Vistrial is for businesses and is not directed to anyone under 18. We do not knowingly collect information from people under 18. If you believe a child has given us information, email ${email} and we will delete it.`,
        },
      ],
    },
    {
      id: "where-processed",
      number: "16",
      title: "Where information is processed",
      blocks: [
        {
          kind: "p",
          text: "We are based in the United States. Our service providers may process information in the United States and in other countries where they operate.",
        },
        {
          kind: "p",
          text: "If you use Vistrial from Canada or elsewhere outside the United States, you understand your information will be transferred to and processed in the United States, which may have different data protection laws than your country.",
        },
      ],
    },
    {
      id: "regions",
      number: "17",
      title: "Region-specific information",
      blocks: [
        {
          kind: "p",
          text: "United States state privacy laws. Depending on where you live, you may have additional rights such as knowing, correcting, deleting, or obtaining a copy of your personal information, and limiting certain uses.",
        },
        {
          kind: "p",
          text: `To ask about these rights, email ${email}. We reply by email.`,
        },
        {
          kind: "p",
          text: `If you are in Canada, email ${email} about your information and about storage in the United States.`,
        },
        {
          kind: "p",
          text: "Vistrial is not currently offered to customers in the European Economic Area, the United Kingdom, or Switzerland.",
        },
      ],
    },
    {
      id: "incidents",
      number: "18",
      title: "Data incidents",
      blocks: [
        {
          kind: "p",
          text: "If we learn that information we hold has been accessed or disclosed without authorization, we will investigate and notify affected customers and any other required parties as the law requires.",
        },
      ],
    },
    {
      id: "changes",
      number: "19",
      title: "Changes to this policy",
      blocks: [
        {
          kind: "p",
          text: "We may update this policy. When we make a material change, we will update the date above and notify account holders by email or in the product before the change takes effect. Past versions are available on request.",
        },
      ],
    },
    {
      id: "contact",
      number: "20",
      title: "Contact us",
      blocks: [
        { kind: "p", text: "Questions, requests, or concerns about this policy or your information:" },
        { kind: "p", text: `Email: ${email}` },
        { kind: "p", text: `${entity}. ${address}.` },
        { kind: "p", text: "To report a security issue, visit /security/report." },
      ],
    },
  ];
}

export function privacyPolicyText(trust: TrustPublic): string {
  const dates = privacyDates(trust);
  const body = privacyPolicySections(trust)
    .flatMap((section) => [
      `${section.number}. ${section.title}`,
      ...section.blocks.flatMap((block) => (block.kind === "ul" ? block.items : [block.text])),
    ])
    .join("\n");
  return `Last updated: ${dates.updated}\nEffective: ${dates.effective}\n${body}`;
}
