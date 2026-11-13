import { COMPANY_ADDRESS, CONTACT_EMAIL, LEGAL_ENTITY } from "@/lib/constants";
import { formatTrustDate, type TrustPublic } from "@/lib/trust/model";
import type { PolicyBlock, PolicySection } from "@/lib/trust/privacy-policy";

/**
 * Public terms for the current product (Growth Architect). A sentence is
 * included only when the product does that thing today. The operator and
 * address come from settings, with the filled-in values as the fallback.
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
    "Vistrial uses AI to research markets and to prepare reports, strategy, and creative drafts. AI output can be wrong, incomplete, or out of date. You are responsible for reviewing it and for deciding what to do with it.",
    "Reports label each claim as observed, inferred, a hypothesis, or backed by your own results, and link to its source. A long-running or popular ad is not proof that it worked. Do not treat a hypothesis as a fact.",
    "Agents do not publish, post, send, or spend anything. A person on your team approves the work. If you approve or use something, it is your decision.",
    "Do not rely on AI output as legal, financial, or other professional advice.",
    "Anthropic provides the AI models our agents use, including their web search and web page reading.",
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
          text: "Each workspace has an Owner, who is responsible for the workspace. Workspaces use roles, and what each person can see and approve depends on their role. Vistrial staff roles exist for support and administration.",
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
          text: "Vistrial is an agentic workforce for business growth: specialized AI agents that research a business's market, sharpen its strategy, and prepare the work to grow. The first agent, Growth Architect, studies competitors, offers, ads, and content from public sources and from the business's own results, and prepares market reports, strategy, ad copy, scripts, briefs, and landing page drafts for a person to review. Skills are released one at a time, and the product shows which are available.",
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
      id: "marketing-compliance",
      number: "5",
      title: "Research, content, and marketing compliance",
      blocks: [
        {
          kind: "p",
          text: "Growth Architect uses official access only: public web pages, official platform APIs, and links you provide. It does not log in to a platform for you and does not get around blocks or limits. You must not ask it to, and you must not use Vistrial to collect content you do not have the right to access.",
        },
        {
          kind: "p",
          text: "Research about competitors and public content is for your own analysis. You are responsible for how you use it, including respecting other people's trademarks, copyrights, and privacy. Do not copy another business's ads, images, or videos.",
        },
        {
          kind: "p",
          text: "You are responsible for any ads, posts, emails, pages, or other content you publish, whether or not Vistrial helped draft it. That includes following advertising laws, platform ad policies, and rules about claims, testimonials, pricing, and financing, which can be stricter for some industries, such as medical and aesthetic services.",
        },
        {
          kind: "p",
          text: "If you import lead lists into Vistrial, you are responsible for having the right to hold that information and for following the laws that apply when you contact those people. Vistrial does not contact your leads.",
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
          text: "Ownership. As between you and Vistrial, you own the information you bring into Vistrial or create with it, including your business profile, uploaded files and results, lead lists, research assignments, and the reports and drafts prepared for you (\"Customer Data\"). Public content that a report links to or quotes stays the property of whoever owns it. We do not claim ownership of Customer Data.",
        },
        {
          kind: "p",
          text: "Our use. You give us the right to host, copy, process, and display Customer Data as needed to provide, secure, support, and improve the service for you, to meet our legal duties, and as described in our Privacy Policy. We do not use the contents of your workspace for advertising.",
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
          text: "Service providers. We use providers to run the service, named in our Privacy Policy. We will tell customers before we add a provider that handles Customer Data.",
        },
        {
          kind: "p",
          text: "Export and deletion. You can ask for an export or deletion of your workspace data through /privacy/requests, as the Privacy Policy describes. Canceling does not delete the workspace on its own. We delete workspace data when you ask us to, after we verify the request.",
        },
        {
          kind: "p",
          text: `Data processing terms. These Terms do not include a standard data processing agreement. If you need one, email ${email}.`,
        },
      ],
    },
    {
      id: "platforms",
      number: "7",
      title: "Third-party platforms and sources",
      blocks: [
        {
          kind: "p",
          text: "Growth Architect reads from third-party platforms, such as YouTube, the Meta Ad Library, TikTok, Instagram, and public websites. We do not control those platforms and are not responsible for their content, availability, changes, or errors. A platform can change or limit its access at any time, which can affect what Vistrial can research. Each report shows which sources were available.",
        },
        {
          kind: "p",
          text: "If Vistrial later lets you connect your own accounts, such as an ad account to read your own results, those accounts stay yours and are governed by your agreements with their providers. Connections will be read-only unless you turn on something else and a person approves it.",
        },
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
          text: "Plans and credits. The Growth plan is $179 per month and includes 15,000 credits each month. One credit is one US cent of your balance. Credits pay for the AI work agents do: each piece of work is charged from your balance at the price shown in the product before it runs. Included credits reset each month and do not carry over. You can buy extra credit packs of 1,000, 2,500 or 5,000 credits, for $10, $25 or $50; credits from packs do not expire while your workspace is active. Custom plans are agreed with us. A new workspace gets one free research session before a plan is needed.",
        },
        {
          kind: "p",
          text: "Payment. Payment is taken by Stripe on its own checkout page, through our billing provider Autumn. Fees are in U.S. dollars and billed in advance. We do not see or store your full card number.",
        },
        {
          kind: "p",
          text: "Renewal. The plan renews automatically each month, on the day you subscribed, until you cancel. By subscribing you authorize that monthly charge.",
        },
        {
          kind: "p",
          text: "Automatic top-up. If you turn on automatic top-up, we charge your saved payment method for a credit pack when your balance falls below the amount you set, up to four times a month. You can turn it off at any time in Billing.",
        },
        {
          kind: "p",
          text: "When credits run out. New work cannot start while your balance is empty. Work already running finishes and is charged in full, which can leave a small negative balance that your next credits cover.",
        },
        {
          kind: "p",
          text: "Taxes. Fees do not include taxes unless an invoice says otherwise. You are responsible for any taxes that apply, and they may be added at checkout or to your invoice.",
        },
        {
          kind: "p",
          text: "Price changes. We may change prices. We will give you at least 30 days notice before a price change takes effect for you. If you do not agree, you can cancel before the change takes effect.",
        },
        {
          kind: "p",
          text: "Failed payments. If a renewal payment fails, the payment is retried and you are emailed so you can update your payment method. If it is still unpaid 7 days after it was due, we may pause new work in the workspace until it is paid. Nothing is deleted, work already running finishes, and you can still ask for an export of your data.",
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
          text: `You can cancel at any time from Billing in the product, which opens Stripe's page for your subscription, or by contacting ${email}. Cancellation stops the next renewal. You keep access, and that month's included credits, until the end of the period you have already paid for. Canceling does not delete the workspace.`,
        },
        {
          kind: "p",
          text: "No refunds. Credits pay for AI work that costs us money as it runs, so the plan fee, credit packs and used or unused credits are not refunded, and we do not refund the remainder of a period you chose to cancel. This does not limit any refund the law requires.",
        },
        { kind: "p", text: "We will refund you if:" },
        {
          kind: "ul",
          items: [
            "We charged you in error, or charged you twice for the same thing. We refund the mistaken amount.",
            "We end your access for reasons other than your breach of these Terms, or we permanently shut down the service. We refund a pro-rated amount for the unused part of the paid period and any unused credit packs.",
          ],
        },
        {
          kind: "p",
          text: "You can ask for an export of your workspace data before it ends. Deletion follows Section 6 and the Privacy Policy.",
        },
        { kind: "p", text: "Refunds are made to the original payment method. A refund is handled by us; it is not an automatic charge reversal in the product." },
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
          text: "Section 9 describes what happens if a payment is late.",
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
        {
          kind: "p",
          text: 'VISTRIAL IS PROVIDED "AS IS" AND "AS AVAILABLE." TO THE FULLEST EXTENT THE LAW ALLOWS, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR FREE, THAT AI OUTPUT OR RESEARCH WILL BE ACCURATE OR COMPLETE, THAT ANY STRATEGY OR AD WILL PERFORM, OR THAT THE SERVICE WILL MEET YOUR REQUIREMENTS OR RESULT IN ANY LEADS, SALES, OR REVENUE. WE DO NOT PROVIDE LEGAL, TAX, OR COMPLIANCE ADVICE.',
        },
      ],
    },
    {
      id: "liability",
      number: "18",
      title: "Limitation of liability",
      blocks: [
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
          kind: "p",
          text: "These Terms do not add other exceptions, such as fraud or willful misconduct, beyond what the law itself requires.",
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
        {
          kind: "p",
          text: "You will defend and reimburse us against claims, losses, and costs (including reasonable legal fees) arising from third-party claims that come from: (a) Customer Data or your right to bring it into Vistrial, (b) content you publish or ads you run, including content Vistrial helped draft, (c) your use of Vistrial in breach of these Terms or the law, or (d) your own accounts on third-party platforms or your agreements with their providers. We will tell you promptly about the claim, let you control the defense with our reasonable cooperation, and you will not settle in a way that admits fault for us without our consent.",
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
          kind: "p",
          text: "These Terms do not waive a jury and do not set a shorter deadline for bringing a claim.",
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
