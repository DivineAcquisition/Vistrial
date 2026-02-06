// ============================================
// CAMPAIGN EMAIL TEMPLATE
// Used for reactivation emails sent to customers
// ============================================

import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface CampaignEmailProps {
  businessName: string;
  subject: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  unsubscribeUrl: string;
}

export function CampaignEmail({
  businessName,
  subject,
  body,
  ctaText,
  ctaUrl,
  unsubscribeUrl,
}: CampaignEmailProps) {
  // Split body into paragraphs
  const paragraphs = body.split('\n').filter((p) => p.trim());

  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Content */}
          <Section style={content}>
            {paragraphs.map((paragraph, index) => (
              <Text key={index} style={paragraphStyle}>
                {paragraph}
              </Text>
            ))}

            {ctaText && ctaUrl && (
              <Section style={buttonSection}>
                <Button style={button} href={ctaUrl}>
                  {ctaText}
                </Button>
              </Section>
            )}
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This email was sent by {businessName} via Vistrial.
            </Text>
            <Text style={footerText}>
              <a href={unsubscribeUrl} style={unsubscribeLink}>
                Unsubscribe
              </a>
              {' from future emails'}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const content = {
  padding: '32px',
};

const paragraphStyle = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '0 0 16px',
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#5347d1',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  padding: '12px 24px',
};

const footer = {
  padding: '24px 32px',
  borderTop: '1px solid #e6ebf1',
  textAlign: 'center' as const,
};

const footerText = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '0 0 8px',
};

const unsubscribeLink = {
  color: '#5347d1',
  textDecoration: 'underline',
};

CampaignEmail.PreviewProps = {
  businessName: 'Sparkle Cleaning Co.',
  subject: 'We miss you!',
  body: `Hi Sarah,

It's been a while since your last cleaning with us, and we wanted to reach out!

We'd love to have you back. As a thank you for being a past customer, we're offering 15% off your next cleaning.

Ready to schedule? Just reply to this email or give us a call.

Hope to see you soon!

Best,
The Sparkle Cleaning Team`,
  ctaText: 'Book Now',
  ctaUrl: 'https://sparklecleaning.com/book',
  unsubscribeUrl: 'https://vistrial.com/unsubscribe?id=123',
} as CampaignEmailProps;

export default CampaignEmail;
