import { formatTrustDate, type TrustPublic } from "@/lib/trust/model";

/**
 * Public privacy policy. A sentence is included only when the product does
 * that thing, or when the draft marked it for counsel. Switch lines stay out
 * until a Platform Admin turns them on.
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

const NAMED_ENTITY = "Divine Agency LLC";

export function privacyEntity(trust: TrustPublic): string {
  const named = trust.legalEntity?.trim();
  return named || NAMED_ENTITY;
}

export function privacyDates(trust: TrustPublic): { updated: string; effective: string } {
  const updated = formatTrustDate(trust.privacyUpdatedOn);
  return { updated, effective: trust.privacyLive ? updated : "Not in effect" };
}

export function privacyPolicySections(trust: TrustPublic): PolicySection[] {
  const entity = privacyEntity(trust);
  const email = trust.privacyEmail;
  const address = trust.mailingAddress?.trim() || "";
  const addressLine = address
    ? `Mailing address: ${address}.`
    : "The registered agent mailing address in Maryland is not on file yet. It will be added before this policy takes effect.";

  const ai: string[] = [
    "Agents work only inside the workspace they belong to.",
    "Text written by leads or contacts is treated as information to read, not as instructions to follow.",
    "Agents cannot send, change, or delete anything without a person on the customer team approving it.",
    "AI output can be wrong. Teams should review it before approving.",
  ];
  if (trust.switches.aiNoTraining) {
    ai.push(
      "Customer workspace information is not used to train those providers' models. This line is included because a Platform Admin confirmed the provider setting.",
    );
  }

  const protection: string[] = [
    "Separate workspaces. Customers are separated from each other, and the separation is enforced in the database, not only on screen.",
    "Role-based access. People see only what their role allows.",
    "Protected credentials. Access keys for connected tools are stored as protected references and are not displayed.",
    "Audit trail. Sign-ins, approvals, and exports are recorded. Important staff actions that change a workspace are recorded.",
    "The website and the application are served over HTTPS. Browsers are told to stay on HTTPS.",
  ];
  if (trust.switches.encryptionAtRest) {
    protection.push("Stored data is encrypted at rest. This line is included because a Platform Admin confirmed the provider setting.");
  }
  if (trust.switches.staffMfa) {
    protection.push("Multi-factor sign-in is required for Vistrial staff. This line is included because a Platform Admin confirmed the live setting.");
  }

  const retention: string[] = [
    "Website access and contact forms that have not been converted into a workspace are deleted after 12 months by default. Requests left in waiting, answered, or closed are not deleted by that job. The period can be set from 1 to 84 months.",
    "Account and workspace information is kept while the workspace is active.",
    "Raw webhook payloads are replaced after 14 days. Imported lead records stay in the workspace. The product does not delete all raw imported data after 7 days.",
    "Call transcripts and recording links are cleared after the workspace retention setting. The default is 365 days. A workspace can set this from 30 days to 1,095 days.",
    "Case files stay while the workspace is active, unless the customer deletes them or asks us to.",
    "Notification records, including the text of the notice, are deleted after 90 days.",
    "Audit records and billing records do not have a separate automatic deletion period.",
    "When a workspace is closed, a delete date is set from that workspace closed-retention setting. The default is 90 days. The offboarding path keeps data for 30 days, then the retention job deletes it.",
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
            "Vistrial helps sales teams bring the records of their leads together in one place, with every call, booking, and outcome in a single case file.",
            "If you visit our website or ask for access, we collect only what we need to respond to you.",
            "If you are a customer, the lead and contact information in your workspace belongs to you. We handle it on your behalf to provide the service.",
            "We do not keep a mailbox of the text messages, emails, or chats sent to your leads. A draft can hold the words until it is sent or dropped, and the stored draft text is then cleared. Call transcripts are kept when a recording source is connected.",
            "Nothing is sent to your leads until a person on your team approves it.",
            "We use a small number of trusted companies to run the service. They are listed on /security/subprocessors once their role and processing location are confirmed.",
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
          text: `Vistrial is operated by ${entity} ("Vistrial," "we," "us," or "our"). We are based in Maryland, United States. ${addressLine}`,
        },
        { kind: "p", text: "This policy covers:" },
        {
          kind: "ul",
          items: [
            "Our public website and its forms.",
            "The Vistrial application, including accounts, workspaces, and notifications.",
            "Our communications with you, such as email and support replies.",
          ],
        },
        { kind: "p", text: "We act in two different roles, and the difference matters:" },
        {
          kind: "p",
          text: "Our own information. For visitors, people who request access, account holders, billing contacts, and people who contact us, we decide why and how the information is used. This policy describes those uses.",
        },
        {
          kind: "p",
          text: "Customer workspace information. A Vistrial customer connects its own tools and brings in information about its leads and contacts. The customer decides what to bring in and how it is used. We process that information for the customer, to provide the service, and follow the customer instructions and our agreement with them. If you are a lead or contact of a customer, Section 13 explains your options.",
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
            "Information needed to keep the site secure, such as records of unusual or abusive traffic.",
            "A choice about site measurement, described in Section 8.",
          ],
        },
        { kind: "h", text: "B. When you request access or contact us" },
        {
          kind: "ul",
          items: [
            "Name, work email address, company, role, and the details you choose to give us in the form, such as your team size, tools, or what you need.",
            "For security review requests: what you need (for example a questionnaire or data processing agreement), any deadline, and anything you add.",
            "For data requests: the details needed to verify and fulfil the request.",
            "Records of our replies and the status of your request.",
          ],
        },
        { kind: "h", text: "C. When you create or use an account" },
        {
          kind: "ul",
          items: [
            "Name, email address, role in your workspace, and sign-in information. Passwords are not stored in readable form.",
            "Settings and preferences, such as notification choices and time zone.",
            "Information about how you use the product, such as sign-in history, actions taken (for example approvals), and security events. We keep an audit trail of important actions.",
          ],
        },
        { kind: "h", text: "D. Customer workspace information" },
        {
          kind: "p",
          text: "A customer workspace may hold information that the customer brings in from its connected sources or enters directly. Depending on what the customer connects, this can include:",
        },
        {
          kind: "ul",
          items: [
            "Lead and contact details: names, email addresses, phone numbers, company, job title, tags, owner, and pipeline stage.",
            "Deal information: values, stage history, and outcomes.",
            "Appointments and bookings: booked, rescheduled, canceled, and no-show status.",
            "Call and meeting records, when a recording source is connected: call logs, recordings, and transcripts, and what they contain (see Section 14).",
            "Records from the CRM, calendars, booking tools, forms, and automation webhooks the customer connects. GoHighLevel is the CRM that works today.",
            "Notes, corrections, uploads, and other information the team types or imports.",
            "Records of what the agents prepared and what the team approved or rejected.",
          ],
        },
        { kind: "p", text: "We keep track of where each item came from, so the team can see its source." },
        { kind: "h", text: "E. What we do not keep as a mailbox" },
        {
          kind: "p",
          text: "We do not keep a mailbox of text messages, emails, or chat messages sent to or received from leads. We may record that a touch happened, such as the channel, time, and result, without keeping the words. Draft text can be stored until the send finishes or is dropped, and is then cleared. Compass does not show message threads.",
        },
        { kind: "h", text: "F. Billing information" },
        {
          kind: "p",
          text: "Payments are handled by Stripe. We store a Stripe customer reference and limited billing information such as plan, billing contact, invoice history, and payment status. We do not see or store a full card number.",
        },
        { kind: "h", text: "G. Support and communications" },
        { kind: "p", text: "Messages you send us, our replies, and information you share to get help." },
        { kind: "h", text: "H. Information from connected tools" },
        {
          kind: "p",
          text: "When a customer connects a tool, we receive the information that customer authorizes. Access is granted on the other tool's own screen, and we ask for the minimum needed. Access keys are stored as protected references, and we do not display them.",
        },
        { kind: "h", text: "I. Information created by our AI features" },
        {
          kind: "p",
          text: "Summaries, draft messages, suggestions, and answers that our agents prepare from the customer workspace information. These belong with the workspace they were created for.",
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
            "Provide, run, and maintain the service, including building case files and showing them to the right people in a workspace.",
            "Create and manage accounts, roles, and invitations.",
            "Prepare drafts and summaries for a customer's team, and send approved messages through the customer's own tools.",
            "Send notices you need or asked for, such as account, security, billing, and product notifications.",
            "Process payments and keep billing records.",
            "Respond to access requests, security review requests, support requests, and data requests.",
            "Keep the service secure, prevent abuse and fraud, and investigate problems.",
            "Meet legal obligations and enforce our terms.",
            "Understand how the product is used so we can fix problems and improve it, using aggregated or de-identified information wherever practical.",
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
            "Nothing is sent to your leads until a person approves it. Before sending, we re-check consent, opt-outs, contact limits, and quiet hours (no messages between 8 pm and 8 am in the local time of the lead, by default).",
            "Opt-outs and do-not-contact markers from any source are processed first.",
            "Historic records imported from a connected CRM do not start alerts, follow-ups, or drafts on their own. A person working that lead, or the lead getting in touch again, is what brings the record into live work.",
            "Vistrial does not change a connected CRM unless you turn that on and a person approves the action.",
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
          text: "Service providers (subprocessors). We use trusted companies to host, store, deliver, and process information on our behalf. They may use it only to provide their service to us. The current public list, with what each does and what it handles, is at /security/subprocessors. A company is listed there only after its processing location is confirmed.",
        },
        {
          kind: "p",
          text: "Connected tools. When a customer connects a tool and approves a send, information goes to that tool as the customer directs. Those tools are the customer's own accounts and are governed by their own terms.",
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
          kind: "note",
          text: "[COUNSEL: confirm wording and how it applies to website visitors]",
        },
        {
          kind: "p",
          text: "The public website does not send visit information to advertising platforms. Optional first-party page counts are described in Section 8.",
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
          text: "Vistrial uses AI to prepare summaries, drafts, alerts, and answers inside a customer workspace. When an AI feature runs, the relevant workspace information is sent to the model provider for that feature. Anthropic is used for drafts, summaries, and answers. Google is used for embeddings and extraction. A provider is added to /security/subprocessors once its processing location is confirmed.",
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
            "Essential: keeping you signed in, protecting against abuse, and remembering security settings. The application cannot work without these.",
            "Preferences: remembering the choice to allow or refuse site measurement. That choice is stored in the browser.",
            "Site measurement: on the public website, if you allow it, we count page views on our own servers. A count is a daily total for an event type and a page path. It does not include your name, your email address, or a cookie that follows you on other sites.",
            "Advertising: we do not load advertising pixels, and we do not load third-party analytics.",
          ],
        },
        {
          kind: "p",
          text: "Optional site measurement runs only on the public website, and only after you allow it. It is not used inside the Vistrial application or on workspace pages, and information in a customer workspace is not sent to it. Hosting the website can still create ordinary server logs. Those logs are separate from the optional page counts.",
        },
        {
          kind: "p",
          text: "You can control site measurement. Use the cookie preferences control on our website to turn it on or off. If your browser sends a Global Privacy Control signal, we treat it as a request to keep site measurement off. Blocking essential cookies may stop parts of the service from working. We do not currently respond to Do Not Track signals other than as described here.",
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
          text: "We send service email: sign-in links, security notices, invitations, billing notices, notifications you set up, data request updates, and replies to your requests. You cannot turn off account, security, and billing notices because they are required to run your account.",
        },
        { kind: "p", text: "Vistrial does not send a separate product newsletter." },
        {
          kind: "p",
          text: "A notification email does not include message text, call transcripts, email addresses, or phone numbers. It can include a first name and a link into the product.",
        },
      ],
    },
    {
      id: "how-long",
      number: "10",
      title: "How long we keep information",
      blocks: [
        {
          kind: "p",
          text: "We keep information only as long as needed for the purposes in this policy, then delete or de-identify it. These are the periods the product enforces today:",
        },
        { kind: "ul", items: retention },
        {
          kind: "p",
          text: "When a customer asks for deletion, we verify the request and a person carries it out through a tracked process. A deletion request is not executed on its own.",
        },
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
          items: [
            "Export their workspace data.",
            "Delete imported data after disconnecting a source.",
            "Delete the workspace.",
          ],
        },
        {
          kind: "p",
          text: `How to ask. Use the data requests page at /privacy/requests, or email ${email}. Workspace Owners can also make requests inside the product. We verify your identity before acting, because we do not want to give your information to the wrong person. We aim to respond within 30 days. The staff queue shows the age of each open request, including requests older than 30 days. We will tell you if we cannot fulfil a request and why.`,
        },
        { kind: "p", text: "You can also disconnect any source at any time, from Vistrial or from the other tool. Data stops flowing when you do." },
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
          text: "Customers use Vistrial to manage their own sales records. If a business has your information in Vistrial, the business decides what to keep and how to use it. Vistrial handles that information on the business's behalf.",
        },
        {
          kind: "p",
          text: `If you want to see, correct, or delete your information, or stop being contacted, the fastest route is to contact the business directly. You can also email ${email}, tell us which business contacted you, and we will pass your request to that business. We may not be able to act on the request ourselves without the customer's direction, but we will tell you what happens next.`,
        },
        {
          kind: "p",
          text: "If you ask not to be contacted, the business's tools are set up to honor opt-outs and do-not-contact markers first.",
        },
      ],
    },
    {
      id: "recordings",
      number: "14",
      title: "Call recordings and transcripts",
      blocks: [
        {
          kind: "p",
          text: "Customers can bring call recordings and transcripts into Vistrial from their call and meeting tools. Laws about recording calls vary, and some states require everyone on a call to agree. Customers are responsible for giving required notices and getting required consent before they record, and for having the right to bring those recordings into Vistrial. Vistrial does not decide whether a call may be recorded. Transcripts are visible only to the roles the customer allows.",
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
          text: "We are based in the United States, and our main database is hosted in the United States (US East, N. Virginia). Service providers may also process information in the United States. Hosting, email, and model providers are named on /security/subprocessors only after a processing location is confirmed.",
        },
        {
          kind: "p",
          text: "If you use Vistrial from Canada or elsewhere outside the United States, you understand your information will be transferred to and processed in the United States, which may have different data protection laws than your country.",
        },
        {
          kind: "note",
          text: "[COUNSEL: add any notice or transfer wording required for Canadian customers or leads.]",
        },
      ],
    },
    {
      id: "regions",
      number: "17",
      title: "Region-specific information",
      blocks: [
        {
          kind: "note",
          text: "[COUNSEL: this section is intentionally left for review. Decide what to include.]",
        },
        {
          kind: "p",
          text: "United States state privacy laws. Depending on where you live, you may have additional rights such as knowing, correcting, deleting, or obtaining a copy of your personal information, and limiting certain uses.",
        },
        {
          kind: "note",
          text: "[COUNSEL: confirm whether Maryland or other state laws apply to Vistrial, list the rights, the request method, the appeal process, and the response times.]",
        },
        {
          kind: "note",
          text: "[COUNSEL: add the rights and contact details Canadian federal and provincial privacy laws require, including how to complain to a privacy regulator and what we tell you about storage in the United States.]",
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
        { kind: "p", text: address ? `${entity}, ${address}` : `${entity}. Mailing address not on file yet.` },
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
