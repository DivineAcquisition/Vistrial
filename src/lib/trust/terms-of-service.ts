import { COMPANY_ADDRESS, CONTACT_EMAIL, LEGAL_ENTITY } from "@/lib/constants";
import { formatTrustDate, type TrustPublic } from "@/lib/trust/model";
import type { PolicyBlock, PolicySection } from "@/lib/trust/privacy-policy";

/**
 * Public terms. Billing stages are included only when the billing system does
 * them. Counsel notes stay. The operator and address come from settings, with
 * the filled-in values as the fallback.
 */

export function termsEntity(trust: TrustPublic): string {
  return trust.legalEntity?.trim() || LEGAL_ENTITY;
}

export function termsAddress(trust: TrustPublic): string {
  return trust.mailingAddress?.trim() || COMPANY_ADDRESS;
}

export function termsDates(trust: TrustPublic): { updated: string; effective: string } {
  return {
    updated: formatTrustDate(trust.termsUpdatedOn),
    effective: formatTrustDate(trust.termsEffectiveOn),
  };
}

export function termsSections(trust: TrustPublic): PolicySection[] {
  const entity = termsEntity(trust);
  const address = termsAddress(trust);
  const email = CONTACT_EMAIL;
  const ai = [
    "Vistrial uses AI to prepare summaries, drafts, alerts, and answers. AI output can be wrong, incomplete, or out of date. You are responsible for reviewing it and for deciding what to do with it.",
    "Agents cannot send, change, or delete anything without a person on your team approving it. If you approve something, it is your decision.",
    "Do not rely on AI output as legal, financial, or other professional advice.",
    "Anthropic is used for drafts, summaries, and answers. Google is used for embeddings and extraction. A provider is added to /security/subprocessors once its processing location is confirmed.",
  ];
  if (trust.switches.aiNoTraining) {
    ai.push(
      "Customer workspace information is not used to train those providers' models. This line is included because a Platform Admin confirmed the provider setting.",
    );
  }

  return [
    {
      id: "agreement",
      number: "1",
      title: "The agreement",
      blocks: [
        {
          kind: "p",
          text: `These Terms of Service ("Terms") are an agreement between you and ${entity} ("Vistrial," "we," "us," or "our"), which operates the Vistrial website and application. Please read them carefully.`,
        },
        {
          kind: "p",
          text: "By creating an account, accepting an invitation to a workspace, requesting access, or using Vistrial in any way, you agree to these Terms and to our Privacy Policy at /privacy. If you are using Vistrial on behalf of a business, you confirm that you have authority to bind that business, and \"you\" includes the business.",
        },
        { kind: "p", text: "If you do not agree, do not use Vistrial." },
        {
          kind: "p",
          text: "If you have a separate signed agreement with us (for example for a Custom plan), that agreement controls where it conflicts with these Terms.",
        },
      ],
    },
    {
      id: "who-can-use",
      number: "2",
      title: "Who can use Vistrial, and accounts",
      blocks: [
        {
          kind: "p",
          text: "Vistrial is for businesses and is not for personal or household use. You must be at least 18 years old and able to enter a binding contract.",
        },
        {
          kind: "p",
          text: "Access to Vistrial may require approval. We can decline or remove access at our discretion, within the limits of these Terms.",
        },
        {
          kind: "p",
          text: "Each workspace has an Owner, who is responsible for the workspace. Workspaces use roles: Workspace Owner, Workspace Member, and Workspace Operator (a customer's own setters, closers, and virtual assistants). Vistrial staff roles exist for support and administration. What each person can see depends on their role.",
        },
        { kind: "p", text: "You are responsible for:" },
        {
          kind: "ul",
          items: [
            "Keeping your sign-in details and any authentication methods secure.",
            "Everything done under your account and your workspace, including by people you invite.",
            "Giving accurate information and keeping it current.",
            "Removing people from your workspace when they should no longer have access.",
          ],
        },
        {
          kind: "p",
          text: `Tell us promptly at ${email} if you think your account has been used without your permission.`,
        },
      ],
    },
    {
      id: "the-service",
      number: "3",
      title: "The service",
      blocks: [
        {
          kind: "p",
          text: "Vistrial brings together information about a business's leads from the tools the business connects (for example a CRM, call and meeting tools, calendars and booking tools, forms, and automation tools) and from what the business's own team enters. GoHighLevel is the CRM that works today. It builds a case file for each lead, shows where each piece came from, and uses agents to help the team notice what needs attention, summarize activity, and prepare drafts for human approval.",
        },
        {
          kind: "p",
          text: "Private Access. Vistrial is currently offered through Private Access, which requires approval. We decide who is admitted and when.",
        },
        {
          kind: "p",
          text: "Changes. We may change, add, or remove features. If we make a change that materially reduces the core service you pay for, we will tell you in advance and you may cancel under Section 10.",
        },
        {
          kind: "p",
          text: "Beta and preview features. Features we label as beta, preview, or early access may be incomplete and may change or end at any time.",
        },
        {
          kind: "p",
          text: "No uptime commitment. We work to keep Vistrial available and reliable, but we do not promise that it will be uninterrupted, error free, or available at any particular time. We do not offer uptime credits. Planned and unplanned maintenance can happen.",
        },
      ],
    },
    {
      id: "acceptable-use",
      number: "4",
      title: "Your responsibilities and acceptable use",
      blocks: [
        { kind: "p", text: "You agree that you will not, and will not allow anyone else to:" },
        {
          kind: "ul",
          items: [
            "Break the law or use Vistrial for unlawful, deceptive, fraudulent, or harassing purposes.",
            "Bring in, store, or use information about people without the legal right to do so.",
            "Upload malicious code, probe or test the security of Vistrial without our written permission, or try to access another customer's workspace or data.",
            "Interfere with the service, overload it, or work around its limits, roles, approval steps, or protections.",
            "Reverse engineer or copy the service, except where the law allows it despite this restriction.",
            "Resell or provide Vistrial to others as a standalone product, or use it to build a competing product.",
            "Use Vistrial to send spam or to contact people who have asked not to be contacted.",
            "Misuse AI features, including by trying to make an agent act outside its approval limits.",
            "Use Vistrial in any way that exposes us, other customers, or other people to harm or legal risk.",
          ],
        },
        { kind: "p", text: "We may investigate suspected misuse and take action under Section 11." },
      ],
    },
    {
      id: "messaging",
      number: "5",
      title: "Messaging, calling, and recording compliance",
      blocks: [
        {
          kind: "p",
          text: "You are responsible for how you contact your leads and for following the laws and rules that apply to you. These can include rules about texting, calling, email, telemarketing, do-not-call lists, consent, opt-outs, calling hours, recording calls, and carrier requirements.",
        },
        {
          kind: "p",
          text: "Vistrial includes safeguards. A person on your team approves each message before it is sent. Before sending, we re-check consent, opt-outs, contact limits, and quiet hours. The default quiet hours are 8 pm to 8 am in the local time of the lead. These safeguards are tools to help you. They are not legal advice and they do not guarantee that your messages or calls comply with any law. Some places set stricter rules than our defaults. You remain responsible for compliance.",
        },
        {
          kind: "p",
          text: "Recordings. If you bring call or meeting recordings or transcripts into Vistrial, you are responsible for giving required notices and getting required consent from everyone on the call, which some places require, and for having the right to use those recordings in Vistrial.",
        },
        { kind: "p", text: "Messages sent to your leads through your own tools are your messages, not ours." },
        {
          kind: "p",
          text: "You must not use Vistrial to send a message to anyone who has opted out, and you must keep your opt-out and do-not-contact information accurate in your connected tools.",
        },
      ],
    },
    {
      id: "your-data",
      number: "6",
      title: "Your data",
      blocks: [
        {
          kind: "p",
          text: "Ownership. As between you and Vistrial, you own the information you bring into Vistrial or create with it, including your leads' information, call records, notes, and outcomes (\"Customer Data\"). We do not claim ownership of Customer Data.",
        },
        {
          kind: "p",
          text: "Our use. You give us the right to host, copy, process, and display Customer Data as needed to provide, secure, support, and improve the service for you, to meet our legal duties, and as described in our Privacy Policy. We do not keep a mailbox of the text messages, emails, or chats sent to or received from your leads. Draft text can be stored until a send finishes or is dropped, and is then cleared. We do not use the contents of your workspace for advertising.",
        },
        {
          kind: "p",
          text: "Aggregated information. We may create statistics from usage of the service in a way that does not identify you, your workspace, your leads, or any person, and we may use those statistics to run and improve Vistrial.",
        },
        {
          kind: "p",
          text: "Your promises. You promise that you have all rights, notices, and consents needed to bring Customer Data into Vistrial and to let us process it as described, and that doing so will not violate any law or any other person's rights.",
        },
        {
          kind: "p",
          text: "Our promises. We will keep Customer Data separate from other customers, limit access by role, and protect credentials. Important staff actions that change a workspace are recorded. Our Security page at /security describes our practices. We are not currently certified under SOC 2, ISO 27001, or a similar standard.",
        },
        {
          kind: "p",
          text: "Subprocessors. We use trusted providers to run the service. The public list is at /security/subprocessors. A company appears there after its processing location is confirmed. We will tell customers before a new company is added to that public list.",
        },
        {
          kind: "p",
          text: "Export and deletion. You can disconnect any source at any time. You can ask for an export or deletion of your workspace data through /privacy/requests, as the Privacy Policy describes. Cancelling a subscription does not delete the workspace. Closing or offboarding a workspace follows the retention periods in the Privacy Policy.",
        },
        {
          kind: "p",
          text: `Data processing terms. If you need a data processing agreement, contact us at ${email}.`,
        },
        {
          kind: "note",
          text: "[COUNSEL: decide whether a standard DPA is offered and how it is referenced.]",
        },
      ],
    },
    {
      id: "connected-tools",
      number: "7",
      title: "Connected tools",
      blocks: [
        {
          kind: "p",
          text: "Vistrial can connect to tools you already use. Those tools are your accounts and are governed by your agreements with their providers. You are responsible for having the right to connect them and for following their terms.",
        },
        {
          kind: "p",
          text: "Connections are read-only by default. Vistrial does not change anything in a connected tool unless you turn that on and a person approves the action. Messages you approve are sent through your own connected tools.",
        },
        {
          kind: "p",
          text: "We do not control third-party tools and are not responsible for their availability, changes, or errors. A change by a third party (for example a change to its interface or limits) can affect what Vistrial can do.",
        },
        { kind: "p", text: "You can disconnect any tool at any time." },
      ],
    },
    {
      id: "ai",
      number: "8",
      title: "AI features",
      blocks: ai.map((text) => ({ kind: "p" as const, text })),
    },
    {
      id: "billing",
      number: "9",
      title: "Plans, payment, and billing",
      blocks: [
        {
          kind: "p",
          text: "Plans. Private Access starts at $97 per month. Custom plans are agreed with us. What each plan includes is shown in the product or in your agreement. Plans may have limits, which we will show you. We do not charge overage fees. Private Access does not include a free trial.",
        },
        {
          kind: "p",
          text: "Billing. Fees are billed in advance through Stripe, in U.S. dollars, on the interval Stripe has for that subscription. A subscription renews until it is canceled. By providing a payment method, you authorize us and Stripe to charge it. We do not see or store your full card number. The price on an invoice is the price in Stripe for that workspace.",
        },
        {
          kind: "p",
          text: "Taxes. Fees do not include taxes unless an invoice says otherwise. You are responsible for any taxes that apply, and we may add them to your invoice.",
        },
        {
          kind: "p",
          text: "Price changes. We may change prices. We will give you at least 30 days notice before a price change takes effect for you. If you do not agree, you can cancel before the change takes effect.",
        },
        {
          kind: "p",
          text: "If a payment fails. Days are counted in America/New_York from the date the payment failed. That date is day 0. Through day 7, everything keeps working. From day 8, new drafts, new AI case files, Compass, and new transcription wait. You can still read your leads. At day 30 the workspace is suspended. Follow-ups stop, and the Owner can still pay, export, and cancel. At day 60 the workspace is closed. Paying what is owed restores a workspace that is past due, restricted, suspended, or closed for non-payment.",
        },
        {
          kind: "p",
          text: "After closing, workspace data follows that workspace retention setting. The default is 90 days. It is not deleted 30 days after closing.",
        },
        {
          kind: "note",
          text: "[COUNSEL: confirm whether deletion after a non-payment close should be 30 days instead of the 90 day default.]",
        },
        { kind: "p", text: "Charges are non-refundable except as stated in Section 10 or required by law." },
        {
          kind: "p",
          text: `Disputed charges. If you think a charge is wrong, contact us at ${email} within 60 days so we can look into it.`,
        },
      ],
    },
    {
      id: "cancellation",
      number: "10",
      title: "Cancellation and refunds",
      blocks: [
        {
          kind: "p",
          text: `You can cancel at any time from billing settings, or by contacting ${email}. Cancellation takes effect at the end of the period you have already paid for, and you keep access until then. We do not refund the remainder of a period you chose to cancel. Canceling does not delete the workspace.`,
        },
        {
          kind: "p",
          text: "You can ask for an export of your workspace data before it ends. Cancellation does not delete the workspace. Deletion follows Section 6 and the Privacy Policy.",
        },
        { kind: "p", text: "We will refund a pro-rated amount for the unused part of a paid period if:" },
        {
          kind: "ul",
          items: [
            "We end your access for reasons other than your breach of these Terms.",
            "We permanently shut down the service.",
            "You ask us to end your access immediately and we agree.",
          ],
        },
        { kind: "p", text: "Refunds are made to the original payment method. A refund of this kind is handled by us. It is not an automatic charge reversal in the product." },
      ],
    },
    {
      id: "suspension",
      number: "11",
      title: "Suspension and termination",
      blocks: [
        { kind: "p", text: "We may suspend or end your access if:" },
        {
          kind: "ul",
          items: [
            "You break these Terms or the law, or your use puts the service, other customers, or other people at risk.",
            "We are required to by law or a legal order.",
            "We end Private Access or the service as a whole, with notice where we reasonably can.",
          ],
        },
        {
          kind: "p",
          text: "A failed payment is not, by itself, one of those automatic stages. Section 9 describes what a failed payment does today.",
        },
        {
          kind: "p",
          text: "Where it is practical and safe to do so, we will tell you why and give you a chance to fix the problem first. We may act immediately if we believe there is serious risk or harm.",
        },
        { kind: "p", text: "You may end your use at any time under Section 10." },
        {
          kind: "p",
          text: "What happens after. Your right to use Vistrial ends. We will handle Customer Data as described in Section 6 and our Privacy Policy. Sections that by their nature should continue (including ownership, payment owed, disclaimers, limits of liability, indemnification, and disputes) continue after these Terms end.",
        },
      ],
    },
    {
      id: "our-property",
      number: "12",
      title: "Our property and your feedback",
      blocks: [
        {
          kind: "p",
          text: "Vistrial, including its software, design, text, and features (but not Customer Data), belongs to us and our licensors. We give you a limited, non-exclusive, non-transferable right to use Vistrial for your own business during your subscription and as these Terms allow. We keep all other rights.",
        },
        {
          kind: "p",
          text: "If you give us suggestions or feedback, we may use them without restriction or payment, and without naming you.",
        },
      ],
    },
    {
      id: "confidentiality",
      number: "13",
      title: "Confidentiality",
      blocks: [
        {
          kind: "p",
          text: "Each of us may receive non-public information from the other that is marked confidential or that a reasonable person would understand to be confidential. Each of us will use it only for the purposes of these Terms, protect it with reasonable care, and not share it except with people who need to know it and who are bound to keep it confidential. This does not apply to information that is public through no fault of the receiver, was already known, was received from a third party without restriction, or must be disclosed by law (in which case we will give notice where allowed).",
        },
        { kind: "p", text: "Customer Data is your confidential information." },
      ],
    },
    {
      id: "publicity",
      number: "14",
      title: "Publicity",
      blocks: [
        {
          kind: "p",
          text: "We will not use your name, logo, or any statement about you in our marketing or customer lists without your written permission.",
        },
      ],
    },
    {
      id: "security",
      number: "15",
      title: "Security and incidents",
      blocks: [
        {
          kind: "p",
          text: "We use measures designed to protect Customer Data, described on our Security page at /security. No system is perfectly secure. If we learn that Customer Data has been accessed or disclosed without authorization, we will investigate and notify affected customers as the law requires.",
        },
        {
          kind: "p",
          text: `Report security issues at ${email} or through the page at /security/report.`,
        },
      ],
    },
    {
      id: "services",
      number: "16",
      title: "Services",
      blocks: [
        {
          kind: "p",
          text: "If you want hands-on help from Vistrial staff beyond support (for example setup, implementation, or managed operations), we will agree the work in a separate written agreement. These Terms cover the software. Fees for the software and fees for any services are separate.",
        },
      ],
    },
    {
      id: "warranties",
      number: "17",
      title: "Disclaimer of warranties",
      blocks: [
        { kind: "note", text: "[COUNSEL: confirm wording and formatting needed to be enforceable]" },
        {
          kind: "p",
          text: 'VISTRIAL IS PROVIDED "AS IS" AND "AS AVAILABLE." TO THE FULLEST EXTENT THE LAW ALLOWS, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR FREE, THAT AI OUTPUT WILL BE ACCURATE, OR THAT THE SERVICE WILL MEET YOUR REQUIREMENTS OR RESULT IN ANY BOOKINGS, SALES, OR REVENUE. WE DO NOT PROVIDE LEGAL, TAX, OR COMPLIANCE ADVICE.',
        },
      ],
    },
    {
      id: "liability",
      number: "18",
      title: "Limitation of liability",
      blocks: [
        { kind: "note", text: "[COUNSEL: confirm cap, exclusions, and wording]" },
        { kind: "p", text: "TO THE FULLEST EXTENT THE LAW ALLOWS:" },
        {
          kind: "p",
          text: "(A) NEITHER OF US WILL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITIES, EVEN IF TOLD THEY MIGHT HAPPEN.",
        },
        {
          kind: "p",
          text: "(B) OUR TOTAL LIABILITY FOR ALL CLAIMS RELATED TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE FEES YOU PAID TO US IN THE SIX (6) MONTHS BEFORE THE EVENT THAT GAVE RISE TO THE CLAIM.",
        },
        {
          kind: "p",
          text: "(C) THESE LIMITS DO NOT APPLY TO LIABILITY THAT CANNOT BE LIMITED BY LAW.",
        },
        {
          kind: "note",
          text: "[COUNSEL: list any other exclusions, for example fraud, willful misconduct, or indemnity obligations.]",
        },
        {
          kind: "p",
          text: "Some places do not allow certain limits, so parts of this section may not apply to you.",
        },
      ],
    },
    {
      id: "indemnity",
      number: "19",
      title: "Indemnification",
      blocks: [
        { kind: "note", text: "[COUNSEL: confirm scope]" },
        {
          kind: "p",
          text: "You will defend and reimburse us against claims, losses, and costs (including reasonable legal fees) arising from third-party claims that come from: (a) Customer Data or your right to bring it into Vistrial, (b) your messaging, calling, or recording practices, (c) your use of Vistrial in breach of these Terms or the law, or (d) your connected tools or your agreements with their providers. We will tell you promptly about the claim, let you control the defense with our reasonable cooperation, and you will not settle in a way that admits fault for us without our consent.",
        },
      ],
    },
    {
      id: "disputes",
      number: "20",
      title: "Governing law and disputes",
      blocks: [
        {
          kind: "p",
          text: "These Terms are governed by the laws of the State of Maryland, without regard to conflict of law rules. The parties do not agree to arbitration.",
        },
        {
          kind: "p",
          text: `If a dispute comes up, please contact us first at ${email} so we can try to resolve it informally. If we cannot resolve it, you and we agree that the state and federal courts located in Prince George's County, Maryland are the exclusive place to bring any claim, and each of us consents to those courts' authority.`,
        },
        {
          kind: "note",
          text: "[COUNSEL: confirm venue, jury waiver, and time limit for bringing claims.]",
        },
      ],
    },
    {
      id: "changes",
      number: "21",
      title: "Changes to these Terms",
      blocks: [
        {
          kind: "p",
          text: "We may update these Terms. When we make a material change, we will update the date above and notify account holders by email or in the product before the change takes effect, and ask you to accept the new version. If you do not agree, you can cancel before the change takes effect. If you keep using Vistrial after it takes effect, you accept the changed Terms.",
        },
      ],
    },
    {
      id: "notices",
      number: "22",
      title: "Notices",
      blocks: [
        {
          kind: "p",
          text: `We may give notice by email to the address on your account, by posting in the product, or by mail. You may give notice to us at ${email}, or by mail to ${entity}, ${address}. Legal notices should be marked "Legal Notice."`,
        },
      ],
    },
    {
      id: "general",
      number: "23",
      title: "General",
      blocks: [
        {
          kind: "ul",
          items: [
            "Entire agreement. These Terms, our Privacy Policy, and any signed agreement or order form are the whole agreement about Vistrial.",
            "Severability. If a part is not enforceable, the rest still applies.",
            "No waiver. Not enforcing a right now does not give it up later.",
            "Assignment. You may not transfer these Terms without our written consent. We may transfer them as part of a merger, acquisition, financing, or sale of assets.",
            "Force majeure. Neither of us is responsible for a delay or failure caused by events beyond reasonable control, other than payment.",
            "Relationship. We are independent parties. Nothing here creates a partnership, agency, or employment relationship.",
            "No third-party rights. These Terms do not give rights to anyone other than you and us.",
            "Headings. Headings are for convenience only.",
          ],
        },
      ],
    },
    {
      id: "contact",
      number: "24",
      title: "Contact",
      blocks: [
        { kind: "p", text: `Questions about these Terms: ${email}` },
        { kind: "p", text: entity },
        { kind: "p", text: address },
      ],
    },
  ];
}

export function termsText(trust: TrustPublic): string {
  const dates = termsDates(trust);
  const body = termsSections(trust)
    .flatMap((section) => [
      `${section.number}. ${section.title}`,
      ...section.blocks.flatMap((block: PolicyBlock) => (block.kind === "ul" ? block.items : [block.text])),
    ])
    .join("\n");
  return `Last updated: ${dates.updated}\nEffective: ${dates.effective}\n${body}`;
}
