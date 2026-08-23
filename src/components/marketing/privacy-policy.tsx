import {
  LegalList,
  LegalMail,
  LegalSection,
  LegalTable,
} from "@/components/marketing/legal-shell";
import {
  COMPANY_ADDRESS,
  CONTACT_EMAIL,
  LEGAL_EMAIL,
  LEGAL_ENTITY,
} from "@/lib/constants";

export function PrivacyPolicyBody() {
  return (
    <>
      <p>
        Vistrial is operated by {LEGAL_ENTITY}, a Maryland limited liability company
        (&quot;Vistrial,&quot; &quot;we,&quot; &quot;us&quot;). This policy explains what we
        collect, why, how long we keep it, and what you can do about it.
      </p>
      <p>
        We have written this in plain language on purpose. If anything here is unclear, contact us
        at <LegalMail email={LEGAL_EMAIL} />.
      </p>

      <LegalSection heading="1. Two kinds of people, two different roles">
        <p>This distinction determines almost everything else in this policy, so it comes first.</p>
        <p>
          <strong>Customers.</strong> Businesses that subscribe to Vistrial, and the individual
          users at those businesses (owners, admins, setters, closers). For customer data, we are
          the <strong>data controller</strong>: we decide what we collect and why.
        </p>
        <p>
          <strong>Prospects.</strong> The people your business is selling to, whose information
          flows into Vistrial from your CRM. For prospect data, we are a{" "}
          <strong>data processor</strong>: you are the controller, we act on your instructions, and
          we do not use that data for our own purposes beyond operating the service for you.
        </p>
        <p>
          If you are a prospect and want your information removed, contact the business that
          contacted you. They control that data. We will assist them in acting on your request, but
          we cannot act on it independently.
        </p>
      </LegalSection>

      <LegalSection heading="2. What we collect about customers">
        <p>
          <strong>Account information.</strong> Name, email address, phone number where provided,
          role, and the organization you belong to.
        </p>
        <p>
          <strong>Business profile.</strong> Information you provide during onboarding about how
          your business sells: offer type, price point, sales cycle, team structure, lead sources,
          qualification criteria, and examples of messages you send. We use this to configure the
          service for you and, in anonymized aggregate form, to improve defaults for other
          customers. See section 7.
        </p>
        <p>
          <strong>Usage data.</strong> Pages viewed, actions taken, features used, and timestamps.
          We use this to operate the service, support you, and understand what is and is not
          working.
        </p>
        <p>
          <strong>Device and technical data.</strong> IP address, browser type, operating system,
          and device identifiers.
        </p>
        <p>
          <strong>Billing information.</strong> Handled by our payment processor. We do not store
          full payment card numbers.
        </p>
        <p>
          <strong>Communications.</strong> Support requests, emails, and call notes when you
          contact us.
        </p>
      </LegalSection>

      <LegalSection heading="3. What we process on your behalf">
        <p>When you connect your CRM, we receive and store:</p>
        <p>
          <strong>Contact records.</strong> Names, email addresses, phone numbers, and the custom
          fields you map, for the people in your CRM.
        </p>
        <p>
          <strong>Activity metadata.</strong> That a message was sent or received, on which
          channel, in which direction, at what time, and by which of your users.
        </p>
        <p>
          <strong>Message content we send.</strong> Where you use Vistrial to dispatch a message,
          we store what was sent.
        </p>
        <p>
          <strong>We do not store the content of inbound messages from your prospects.</strong>{" "}
          Vistrial records that a reply occurred and when. The conversation itself stays in your
          CRM. This is an architectural decision, not just a policy one.
        </p>
        <p>
          <strong>Call recordings and transcripts.</strong> Where you connect a call recording
          service, we receive transcripts of calls between your team and your prospects.{" "}
          <strong>We do not record calls and we do not store audio.</strong> We store the
          transcript text and the structured information extracted from it.
        </p>
        <p>
          <strong>Extracted information.</strong> Summaries, stated objections, budget and timeline
          signals, decision process, agreed next steps, and verbatim quotes taken from those
          transcripts.
        </p>
        <p>
          <strong>Historical data.</strong> When you first connect your CRM, we import up to twelve
          months of prior contacts, opportunities, appointments, and activity metadata, to
          establish a baseline for measuring results. We do not import historical message bodies.
        </p>
        <p>
          <strong>Payments and revenue.</strong> Transaction records associated with a contact,
          used to measure outcomes.
        </p>
      </LegalSection>

      <LegalSection heading="4. Call recording and transcripts">
        <p>This section deserves particular attention.</p>
        <p>
          <strong>Your responsibility.</strong> You are responsible for obtaining any consent
          required for recording, transcribing, and processing calls with your prospects.
          Requirements vary by jurisdiction and some require the consent of every participant. We
          are not able to determine what applies to you, and you should not rely on us to.
        </p>
        <p>
          <strong>What we do with transcripts.</strong> Transcripts are used to extract structured
          information for the account they belong to: readiness signals, objections, and quotes
          used in follow-up drafts your team reviews. Transcripts are sent to our AI provider
          solely to perform that extraction.
        </p>
        <p>
          <strong>What we do not do.</strong> We do not use transcript content to train AI models.
          We do not use transcripts from one customer to serve another. We do not sell, share, or
          license transcript content. Our staff cannot read your transcripts as part of routine
          support; access requires a specific reason, is time-limited, and is logged.
        </p>
        <p>
          <strong>Retention.</strong> Transcripts are retained for a configurable period per
          account, defaulting to 12 months from the date of the call and adjustable between 30 days
          and 24 months in your settings. Extracted structured information is retained longer,
          because it remains useful after the raw transcript should be gone and is far less
          sensitive. You can request earlier deletion of any transcript at any time. See section 10
          for the full retention schedule.
        </p>
      </LegalSection>

      <LegalSection heading="5. AI processing">
        <p>
          Vistrial uses third-party AI services to extract structured information from call
          transcripts and to draft follow-up messages.
        </p>
        <LegalList>
          <li>Content sent to those services is limited to what the task requires</li>
          <li>
            The AI provider processes it to return a result; content is not used to train their
            models under our agreement
          </li>
          <li>
            <strong>AI does not send anything to your prospects.</strong> Every message Vistrial
            drafts requires approval by a person on your team before it is sent. There is no
            autonomous sending path.
          </li>
          <li>
            AI-generated readiness scores and extracted information are aids to your team&apos;s
            judgment, not decisions made about anyone
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="6. How we use data">
        <p>
          <strong>Customer data:</strong> to provide and operate the service, authenticate users,
          provide support, send service communications, bill you, improve the product, and meet
          legal obligations.
        </p>
        <p>
          <strong>Prospect data:</strong> only to provide the service to you. We score readiness,
          track touch history, extract call information, draft follow-up for your approval, and
          produce reporting. We do not use it for our own marketing, we do not sell it, and we do
          not share it with other customers.
        </p>
        <p>
          <strong>We do not sell personal information</strong> to anyone, under any definition of
          &quot;sell&quot; in any applicable privacy law.
        </p>
      </LegalSection>

      <LegalSection heading="7. Aggregated and anonymized data">
        <p>
          We produce aggregated statistics across customers to generate benchmarks and improve
          configuration defaults, for example typical response times or close rates for businesses
          of a similar type and size.
        </p>
        <p>Rules we apply:</p>
        <LegalList>
          <li>
            Aggregates are computed only where enough businesses are represented that no individual
            business can be identified or its figures reconstructed
          </li>
          <li>
            No customer&apos;s identity, figures, transcripts, message content, or prospect
            information appears in any aggregate
          </li>
          <li>
            <strong>
              No individual user&apos;s performance data ever crosses an organizational boundary
            </strong>
            , in any form or at any level of aggregation
          </li>
          <li>
            You can opt out of contributing to aggregates at any time in your settings, and you
            still receive benchmarks if you do
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="8. Who we share data with">
        <p>
          <strong>Service providers,</strong> each bound by contract to protect it and use it only
          to provide services to us:
        </p>
        <LegalTable
          headers={["Purpose", "What they process"]}
          rows={[
            ["Cloud hosting and database", "All service data"],
            ["AI processing", "Transcript content and extraction outputs"],
            ["Email delivery", "Email addresses and message content we send"],
            ["Payment processing", "Billing information"],
            ["Error monitoring and analytics", "Technical and usage data"],
            ["Customer support tooling", "Support communications"],
          ]}
        />
        <p>
          A current list of subprocessors with their names and locations is available on request at{" "}
          <LegalMail email={LEGAL_EMAIL} />.
        </p>
        <p>
          <strong>Your CRM provider.</strong> We read from and write to the CRM you connect, at
          your direction.
        </p>
        <p>
          <strong>Legal.</strong> We may disclose information where required by law, valid legal
          process, or to protect rights and safety. Where we are legally permitted to notify you
          first, we will.
        </p>
        <p>
          <strong>Business transfer.</strong> If we are acquired or merge, data may transfer as
          part of that transaction. You will be notified and this policy continues to apply until
          you are given notice of any change.
        </p>
      </LegalSection>

      <LegalSection heading="9. Security">
        <LegalList>
          <li>Encryption in transit and at rest</li>
          <li>
            CRM access tokens encrypted at rest, never displayed in the interface, never written to
            logs
          </li>
          <li>
            Data isolated per organization and enforced at the database level, not only in
            application code
          </li>
          <li>
            Access controls by role, with staff access to customer data requiring a specific
            reason, time limits, and logging
          </li>
          <li>Automated backups stored separately and encrypted</li>
          <li>Regular dependency scanning and security review</li>
        </LegalList>
        <p>
          No system is perfectly secure. If a breach affects your data, we will notify you without
          undue delay and in any case within the timeframes applicable law requires.
        </p>
      </LegalSection>

      <LegalSection heading="10. Retention">
        <LegalTable
          headers={["Data", "Retained"]}
          rows={[
            ["Account and business profile", "Life of the account, then 30 days"],
            ["Leads, touches, calls, scores, revenue", "Life of the account, then 30 days"],
            ["Call transcripts", "Configurable per account, default 12 months from the call"],
            ["Information extracted from transcripts", "Life of the account, then 30 days"],
            ["Historical data imported at connection", "Life of the account, then 30 days"],
            ["Raw integration payloads", "30 days"],
            ["Notification and delivery records", "12 months"],
            ["Access and administrative audit logs", "24 months"],
            ["Application and error logs", "90 days"],
            ["Backups", "30 days on a rolling basis"],
            ["Billing and tax records", "7 years, as required by law"],
            [
              "Records of deletion requests",
              "Retained indefinitely, as proof the deletion occurred",
            ],
          ]}
        />
        <p>
          <strong>Why transcripts default to 12 months.</strong> Transcripts are the most sensitive
          data we hold, so we do not keep them indefinitely. Twelve months is long enough to cover
          a full sales cycle plus seasonal variation, which is what measuring whether the service
          works requires. You can set a shorter window, down to 30 days, or a longer one up to 24
          months, in your account settings. The structured information extracted from a transcript
          is kept after the transcript is deleted, because it remains useful and is far less
          sensitive than the full conversation.
        </p>
        <p>
          <strong>Backups.</strong> Deleted data may persist in encrypted backups for up to 30 days
          after deletion from live systems, after which it is overwritten on the normal backup
          cycle. Backups are not used to restore data you have asked us to delete.
        </p>
        <p>
          <strong>On account closure</strong>, we retain your data for 30 days so you can export
          it, then delete it. You may request immediate deletion instead, and we will act on that
          within 30 days.
        </p>
      </LegalSection>

      <LegalSection heading="11. Your rights">
        <p>
          Depending on where you are, you may have the right to access, correct, delete, port,
          restrict, or object to processing of your personal information, and to withdraw consent.
        </p>
        <p>
          <strong>Customers</strong> can exercise most of these directly in the product: export
          your organization&apos;s data at any time, delete your organization&apos;s data, and
          update your profile. For anything else, contact <LegalMail email={LEGAL_EMAIL} />.
        </p>
        <p>
          <strong>Prospects</strong> should contact the business that holds their information. We
          will support that business in responding.
        </p>
        <p>
          We respond within the timeframe applicable law requires, and within thirty days where no
          specific timeframe applies. We do not discriminate against anyone for exercising these
          rights.
        </p>
      </LegalSection>

      <LegalSection heading="12. International transfers">
        <p>
          We are based in the United States and process data there. If you are outside the United
          States, your information is transferred there. Where required, we use appropriate
          transfer mechanisms including standard contractual clauses.
        </p>
      </LegalSection>

      <LegalSection heading="13. Children">
        <p>
          Vistrial is a business tool not intended for anyone under 18. We do not knowingly collect
          information from children. If we learn we have, we delete it.
        </p>
      </LegalSection>

      <LegalSection heading="14. Changes">
        <p>
          We will post changes here and update the date above. For material changes we will notify
          account owners by email at least thirty days before they take effect, unless a change is
          required sooner by law.
        </p>
      </LegalSection>

      <LegalSection heading="15. Contact">
        <address className="not-italic">
          {LEGAL_ENTITY}
          <br />
          {COMPANY_ADDRESS}
          <br />
          <LegalMail email={LEGAL_EMAIL} />
          <br />
          <LegalMail email={CONTACT_EMAIL} />
        </address>
        <p>
          For data protection inquiries: <LegalMail email={LEGAL_EMAIL} />
        </p>
      </LegalSection>
    </>
  );
}
