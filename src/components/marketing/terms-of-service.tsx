import {
  LegalHref,
  LegalList,
  LegalMail,
  LegalSection,
} from "@/components/marketing/legal-shell";
import { COMPANY_ADDRESS, LEGAL_EMAIL, LEGAL_ENTITY } from "@/lib/constants";

export function TermsOfServiceBody() {
  return (
    <>
      <p>
        These Terms govern your use of Vistrial, operated by {LEGAL_ENTITY}, a Maryland limited
        liability company (&quot;Vistrial,&quot; &quot;we,&quot; &quot;us&quot;). By creating an
        account, connecting a CRM, or using the service, you agree to them. If you are agreeing on
        behalf of a business, you represent that you have authority to bind it, and
        &quot;you&quot; means that business.
      </p>

      <LegalSection heading="1. What Vistrial does">
        <p>
          Vistrial is a sales operations layer that connects to your existing CRM. It scores lead
          readiness, tracks contact history, ingests call transcripts and extracts structured
          information from them, drafts follow-up messages for your team&apos;s approval, and
          reports on outcomes.
        </p>
        <p>
          <strong>What Vistrial does not do:</strong>
        </p>
        <LegalList>
          <li>It does not make calls or hold conversations with your prospects</li>
          <li>It does not send any message without approval from a person on your team</li>
          <li>It does not replace your CRM. Your CRM remains your system of record.</li>
          <li>It does not guarantee any sales result</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="2. Accounts and users">
        <p>
          You are responsible for your account, your users&apos; actions, keeping credentials
          secure, and telling us promptly if you suspect unauthorized access.
        </p>
        <p>
          You must be 18 or older and legally able to enter a contract. Accounts are for the
          business that created them; do not share access with anyone outside it.
        </p>
        <p>
          You control who you invite and what role they hold. Users at your organization act on
          your behalf and you are responsible for their conduct.
        </p>
      </LegalSection>

      <LegalSection heading="3. Your data">
        <p>
          <strong>You own your data.</strong> Contacts, transcripts, extracted information, touch
          history, revenue records, and your business profile remain yours. We claim no ownership.
        </p>
        <p>
          <strong>You grant us a license</strong> to host, process, transmit, display, and modify
          your data solely to provide the service to you, and to produce anonymized aggregates as
          described in the <LegalHref href="/privacy">Privacy Policy</LegalHref>. This license ends
          when the data is deleted.
        </p>
        <p>
          <strong>Export and deletion.</strong> You can export your data at any time and request
          deletion at any time. See the <LegalHref href="/privacy">Privacy Policy</LegalHref> for
          how and how quickly.
        </p>
      </LegalSection>

      <LegalSection heading="4. Your responsibilities regarding prospects">
        <p>This section allocates the obligations that matter most in this product. Read it.</p>
        <p>
          <strong>Consent and lawful basis.</strong> You are responsible for having the legal right
          to collect, process, and share with us the information about your prospects that flows
          into Vistrial, and for any notice or consent that requires.
        </p>
        <p>
          <strong>Call recording.</strong> You are responsible for complying with all laws
          governing the recording and transcription of calls, including laws requiring the consent
          of every participant, which vary by jurisdiction and can carry criminal penalties.{" "}
          <strong>We do not record calls.</strong> You supply transcripts from a service you have
          chosen and configured. We are not in a position to determine what your jurisdiction
          requires and you may not rely on us to do so.
        </p>
        <p>
          <strong>Messaging law.</strong> You are responsible for complying with laws and carrier
          rules governing electronic communications, including TCPA, CAN-SPAM, CASL, and applicable
          equivalents: consent to contact, honoring opt-outs, identifying yourself, and respecting
          quiet hours. Vistrial provides tools that support compliance, including suppression
          handling, quiet-hour controls, and rate limiting.{" "}
          <strong>Those tools assist you; they do not transfer the obligation to us.</strong>
        </p>
        <p>
          <strong>Approval.</strong> Every message Vistrial drafts is reviewed and approved by a
          person on your team before it is sent.{" "}
          <strong>
            You are responsible for the content of every message sent from your account,
          </strong>{" "}
          including messages Vistrial drafted, because a person on your team approved it.
        </p>
        <p>
          <strong>Your prospects&apos; rights.</strong> Requests from prospects about their
          information come to you. You are the controller of that data.
        </p>
      </LegalSection>

      <LegalSection heading="5. Acceptable use">
        <p>Do not use Vistrial to:</p>
        <LegalList>
          <li>Contact people who have not consented, or who have opted out</li>
          <li>Send unlawful, deceptive, harassing, or fraudulent messages</li>
          <li>Circumvent suppression, opt-out handling, quiet hours, or rate limits</li>
          <li>Access another organization&apos;s data, or attempt to</li>
          <li>
            Reverse engineer, scrape, resell, or provide the service to third parties as your own
          </li>
          <li>Upload malware, or interfere with the service&apos;s operation or security</li>
          <li>Process data you do not have the right to process</li>
          <li>Exceed reasonable use in a way that degrades the service for others</li>
        </LegalList>
        <p>
          We may suspend an account for a violation. Where the violation creates risk of harm or
          legal exposure, we may suspend immediately without notice.
        </p>
      </LegalSection>

      <LegalSection heading="6. Third-party services">
        <p>
          Vistrial depends on services you connect and services we use, including your CRM, call
          recording providers, and AI providers.
        </p>
        <LegalList>
          <li>
            We are not responsible for those services&apos; availability, accuracy, or changes to
            them
          </li>
          <li>
            Your use of a connected service is governed by your agreement with that provider
          </li>
          <li>
            If a provider changes or discontinues its API, functionality may change or stop, and we
            will give you as much notice as we practically can
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="7. AI-generated output">
        <p>
          Readiness scores, extracted call information, drafted messages, and reporting insights
          are produced in part by AI systems.
        </p>
        <p>
          <strong>They may be wrong.</strong> Extraction can misread a call. A score can be
          miscalibrated. A draft can misstate something.
        </p>
        <LegalList>
          <li>Review AI output before relying on it, and always before approving a message</li>
          <li>
            Scores and extractions are aids to your judgment, not decisions about anyone, and
            should not be treated as the sole basis for a decision affecting a person
          </li>
          <li>You are responsible for anything sent from your account after approval</li>
          <li>We give no warranty as to the accuracy of AI-generated output</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="8. Fees">
        <p>Fees, billing frequency, and terms are as stated in your order form or subscription plan.</p>
        <LegalList>
          <li>
            Fees are billed in advance and are non-refundable except where required by law or
            stated in your order form
          </li>
          <li>Late payment may result in suspension after notice</li>
          <li>
            We may change pricing with at least thirty days&apos; notice, effective at your next
            renewal
          </li>
          <li>You are responsible for applicable taxes</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="9. Term, suspension, and termination">
        <p>These Terms run while you have an account.</p>
        <p>
          <strong>You may cancel</strong> at any time, effective at the end of your current billing
          period.
        </p>
        <p>
          <strong>We may terminate or suspend</strong> for material breach that is not cured within
          30 days of notice, for non-payment, for a violation of section 5, or if required by law.
        </p>
        <p>
          <strong>On termination:</strong> access ends, your data is available for export for 30
          days, then deleted per the <LegalHref href="/privacy">Privacy Policy</LegalHref>.
          Sections that by their nature survive, including sections 3, 4, 7, 10, 11, 12, and 13,
          survive.
        </p>
      </LegalSection>

      <LegalSection heading="10. Warranties and disclaimers">
        <p>
          We provide the service with reasonable skill and care and will use commercially
          reasonable efforts to keep it available.
        </p>
        <p>
          <strong>Otherwise, the service is provided &quot;as is.&quot;</strong> To the maximum
          extent permitted by law we disclaim all other warranties, express or implied, including
          merchantability, fitness for a particular purpose, and non-infringement.
        </p>
        <p>
          <strong>Specifically, we do not warrant that:</strong>
        </p>
        <LegalList>
          <li>The service will be uninterrupted or error-free</li>
          <li>AI-generated output will be accurate</li>
          <li>Readiness scores will predict outcomes</li>
          <li>
            <strong>Using Vistrial will increase your sales, close rate, or revenue</strong>
          </li>
        </LegalList>
        <p>
          Any figures we publish or discuss describe past results for other businesses and are not
          a promise of what you will achieve. Results depend on your offer, your market, your team,
          and how you use the product, none of which we control.
        </p>
      </LegalSection>

      <LegalSection heading="11. Limitation of liability">
        <p>To the maximum extent permitted by law:</p>
        <LegalList>
          <li>
            Neither party is liable for indirect, incidental, special, consequential, or punitive
            damages, or for lost profits, revenue, data, or business opportunity, even if advised
            such damages were possible
          </li>
          <li>
            Our total aggregate liability arising out of or relating to these Terms or the service
            is limited to the amount you paid us in the twelve months before the event giving rise
            to the claim
          </li>
        </LegalList>
        <p>
          These limits do not apply to your payment obligations, your indemnification obligations
          under section 12, or to liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection heading="12. Indemnification">
        <p>
          You will defend, indemnify, and hold us harmless from claims, damages, losses, and
          reasonable legal fees arising from:
        </p>
        <LegalList>
          <li>Your use of the service</li>
          <li>Your breach of these Terms</li>
          <li>
            <strong>Your communications with prospects, including messages sent from your account</strong>
          </li>
          <li>
            <strong>Your recording or transcription of calls</strong>
          </li>
          <li>
            Your violation of any law, including privacy, consent, recording, and electronic
            communications law
          </li>
          <li>Your violation of any third party&apos;s rights</li>
        </LegalList>
        <p>
          We will defend, indemnify, and hold you harmless from third-party claims that the service
          as provided by us infringes that party&apos;s intellectual property rights, provided you
          notify us promptly and let us control the defense.
        </p>
      </LegalSection>

      <LegalSection heading="13. Confidentiality">
        <p>
          Each party will protect the other&apos;s confidential information with at least
          reasonable care, use it only to perform under these Terms, and not disclose it except to
          personnel and advisors who need it and are bound to protect it.
        </p>
        <p>
          This does not cover information that is public through no fault of the receiving party,
          already known without obligation, independently developed, or lawfully received from a
          third party. Disclosure required by law is permitted with notice where legally allowed.
        </p>
      </LegalSection>

      <LegalSection heading="14. Intellectual property">
        <p>
          We own the service, its software, design, documentation, and all improvements, including
          anything we develop from anonymized aggregate insights. You own your data.
        </p>
        <p>If you give us feedback or suggestions, we may use them without obligation to you.</p>
      </LegalSection>

      <LegalSection heading="15. Changes to the service and these Terms">
        <p>
          We may modify the service. We will not materially reduce core functionality during a paid
          term without notice.
        </p>
        <p>
          We may update these Terms. Material changes take effect thirty days after we notify
          account owners by email, unless required sooner by law. Continuing to use the service
          after that means you accept them. If you do not, cancel before they take effect.
        </p>
      </LegalSection>

      <LegalSection heading="16. General">
        <p>
          <strong>Governing law.</strong> Maryland law, without regard to conflict of law rules.
        </p>
        <p>
          <strong>Entire agreement.</strong> These Terms plus the{" "}
          <LegalHref href="/privacy">Privacy Policy</LegalHref> and any order form are the whole
          agreement between us on this subject.
        </p>
        <p>
          <strong>Assignment.</strong> You may not assign without our consent. We may assign to an
          affiliate or in connection with a merger or acquisition.
        </p>
        <p>
          <strong>Severability.</strong> If a provision is unenforceable, the rest stands.
        </p>
        <p>
          <strong>No waiver.</strong> Not enforcing a provision does not waive it.
        </p>
        <p>
          <strong>Force majeure.</strong> Neither party is liable for delays caused by events
          beyond reasonable control.
        </p>
        <p>
          <strong>Relationship.</strong> Independent contractors. No partnership, agency, or
          employment relationship.
        </p>
      </LegalSection>

      <LegalSection heading="17. Contact">
        <address className="not-italic">
          {LEGAL_ENTITY}
          <br />
          {COMPANY_ADDRESS}
          <br />
          <LegalMail email={LEGAL_EMAIL} />
        </address>
      </LegalSection>
    </>
  );
}
