import {
  LegalHref,
  LegalList,
  LegalMail,
  LegalSection,
} from "@/components/marketing/legal-shell";
import { COMPANY_ADDRESS, LEGAL_EMAIL, LEGAL_ENTITY } from "@/lib/constants";

export function DisclaimerBody() {
  return (
    <>
      <p>
        Vistrial is operated by {LEGAL_ENTITY}, a Maryland limited liability company
        (&quot;Vistrial,&quot; &quot;we,&quot; &quot;us&quot;). This page explains the limits of
        what our website, marketing, and product represent. It works alongside our{" "}
        <LegalHref href="/terms">Terms of Service</LegalHref> and{" "}
        <LegalHref href="/privacy">Privacy Policy</LegalHref>, and where those documents conflict
        with this one, the Terms of Service control.
      </p>

      <LegalSection heading="1. No guarantee of results">
        <p>
          Vistrial helps sales teams work their leads faster and with better context.{" "}
          <strong>It does not guarantee any sales outcome.</strong>
        </p>
        <p>We make no representation or warranty that using Vistrial will:</p>
        <LegalList>
          <li>Increase your revenue, close rate, or number of clients</li>
          <li>Improve your response times, show rates, or conversion</li>
          <li>Produce any specific return on what you spend with us</li>
        </LegalList>
        <p>
          Results depend on your offer, your pricing, your market, your lead quality, your team,
          and how consistently that team uses the system.{" "}
          <strong>We do not make calls and we do not close deals.</strong> Your team does. Vistrial
          makes sure every lead gets worked and that whoever works it knows what they are walking
          into. The outcome still belongs to the people having the conversations.
        </p>
      </LegalSection>

      <LegalSection heading="2. Results shown are not typical, and are not a projection">
        <p>
          Any figures, case studies, testimonials, screenshots, or examples on our website or in
          our marketing describe{" "}
          <strong>what specific businesses experienced in their specific circumstances.</strong>
        </p>
        <LegalList>
          <li>They are past results, not predictions</li>
          <li>They are not averages, and should not be read as typical</li>
          <li>They do not represent what you or any other business will achieve</li>
          <li>
            Some examples use illustrative or fabricated data to demonstrate how the product works.
            Where that is the case we label it, and it never represents a real business.
          </li>
        </LegalList>
        <p>You should assume that your results will differ.</p>
      </LegalSection>

      <LegalSection heading="3. The Lead Leak Audit">
        <p>The Lead Leak Audit is a free assessment produced from data in your own CRM.</p>
        <LegalList>
          <li>
            Its accuracy depends entirely on the accuracy and completeness of your CRM history. A
            CRM that was inconsistently maintained will produce an incomplete picture, and we will
            tell you when that is the case rather than filling the gaps.
          </li>
          <li>
            Any value estimate in the audit is an <strong>estimate</strong>, calculated from
            figures you provide about your own close rate and price point. It is arithmetic applied
            to your assumptions, not a valuation, a forecast, or a promise of recoverable revenue.
          </li>
          <li>
            The audit is an informational assessment. It is not financial, business, legal, or
            investment advice.
          </li>
          <li>It reflects your data at the time it was produced. Do not treat an old audit as current.</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="4. AI-generated output">
        <p>
          Vistrial uses AI systems to extract information from call transcripts and to draft
          follow-up messages.
        </p>
        <p>
          <strong>AI output can be wrong.</strong> Extraction can misread a call, misattribute a
          statement, or miss something that was said. Readiness scores can be miscalibrated for
          your business. Drafted messages can misstate a fact or strike the wrong tone.
        </p>
        <p>Because of this:</p>
        <LegalList>
          <li>
            <strong>Review everything before you act on it.</strong> Every message Vistrial drafts
            requires approval from a person on your team before it is sent, deliberately, and that
            approval is where responsibility for the content sits.
          </li>
          <li>
            <strong>Readiness scores are aids to judgment, not decisions.</strong> They rank who to
            contact first. They are not a verdict on a person, a prediction of who will buy, or a
            substitute for your team&apos;s own read.
          </li>
          <li>
            <strong>Call quality and coaching outputs describe patterns, not people.</strong> They
            are intended to support coaching conversations. They are not performance evaluations,
            they are not designed to support employment decisions, and they should not be used as
            the sole basis for one.
          </li>
          <li>
            Nothing produced by Vistrial should be used as the only basis for a decision that
            materially affects a person.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="5. Compliance is yours">
        <p>
          Vistrial provides tools that support compliant outreach, including suppression handling,
          quiet hours, rate limiting, and an approval step before anything sends.{" "}
          <strong>Those tools assist you. They do not transfer legal responsibility to us.</strong>
        </p>
        <p>You are solely responsible for complying with the laws that apply to your business, including:</p>
        <LegalList>
          <li>
            <strong>Call recording and wiretap law.</strong> Many jurisdictions, including Maryland,
            require the consent of every participant before a call can be recorded. Violations can
            carry criminal penalties. <strong>We do not record calls.</strong> You choose and
            configure your own recording service and supply the transcripts.
          </li>
          <li>
            <strong>Electronic communications law,</strong> including TCPA, CAN-SPAM, CASL, and
            their equivalents: consent to contact, honoring opt-outs, identifying your business,
            and respecting quiet hours.
          </li>
          <li>
            <strong>Privacy and data protection law</strong> governing the information you collect
            about your prospects and share with us.
          </li>
        </LegalList>
        <p>
          Nothing on our website or in our product is legal advice. We are not able to determine
          what applies to your business or your jurisdiction, and you should not rely on us to.
          Consult a qualified attorney.
        </p>
      </LegalSection>

      <LegalSection heading="6. Not professional advice">
        <p>
          Content on our website, in our product, in reports, and in our marketing is for general
          informational purposes. It is not legal, financial, tax, accounting, employment, or
          professional advice, and does not create any professional relationship between us.
        </p>
        <p>
          Insights, benchmarks, and recommendations Vistrial produces are analytical outputs based
          on available data. They may be incomplete or inaccurate, and they are not a substitute
          for professional judgment.
        </p>
      </LegalSection>

      <LegalSection heading="7. Benchmarks and comparative data">
        <p>
          Where we show how your figures compare to similar businesses, those comparisons are drawn
          from aggregated, anonymized data across customers.
        </p>
        <LegalList>
          <li>
            Comparison groups are matched approximately, on characteristics like offer type, price
            band, and volume, and no two businesses are truly comparable
          </li>
          <li>
            Benchmarks reflect the businesses that use Vistrial, which is not a representative
            sample of any industry
          </li>
          <li>We suppress any comparison drawn from too few businesses to be meaningful</li>
          <li>A benchmark is context for a conversation, not a target and not a standard</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading="8. Third-party services">
        <p>
          Vistrial connects to services we do not control, including GoHighLevel, call recording
          providers, and AI providers.
        </p>
        <LegalList>
          <li>
            We are not responsible for their availability, accuracy, security, pricing, or terms
          </li>
          <li>
            If a provider changes or discontinues an API, Vistrial functionality may change or stop
            working
          </li>
          <li>Links to third-party sites are provided for convenience and are not an endorsement</li>
          <li>
            Your use of any connected service is governed by your agreement with that provider
          </li>
        </LegalList>
        <p>
          <strong>
            GoHighLevel and LeadConnector are trademarks of their respective owners. Vistrial is an
            independent product and is not endorsed by, affiliated with, or sponsored by HighLevel.
          </strong>
        </p>
      </LegalSection>

      <LegalSection heading="9. Accuracy of this website">
        <p>
          We work to keep our website accurate and current, but we make no warranty that it is
          complete, accurate, or up to date. Product features, pricing, and descriptions may change
          without notice. Nothing on the website is an offer or a binding commitment.
        </p>
      </LegalSection>

      <LegalSection heading="10. Testimonials">
        <p>
          Testimonials reflect the experience of the individual giving them and are not necessarily
          representative. Where a person providing a testimonial received any compensation,
          discount, or other consideration, we disclose it alongside the testimonial.
        </p>
      </LegalSection>

      <LegalSection heading="11. Limitation of liability">
        <p>
          Your use of our website, our product, and anything we produce is at your own risk. To the
          fullest extent permitted by law, {LEGAL_ENTITY} is not liable for any loss or damage
          arising from reliance on information we provide or from your use of the service. The
          limitations in section 11 of our <LegalHref href="/terms">Terms of Service</LegalHref>{" "}
          apply in full.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact">
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
