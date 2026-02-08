// ============================================
// BASE EMAIL LAYOUT
// Shared layout for all emails
// ============================================

import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface BaseLayoutProps {
  preview: string;
  children: React.ReactNode;
  footerText?: string;
}

export function BaseLayout({ preview, children, footerText }: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Img
              src="https://vistrial.io/vsds.png"
              width="120"
              height="36"
              alt="Vistrial"
            />
          </Section>

          {/* Content */}
          <Section style={content}>{children}</Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerTextStyle}>
              {footerText || 'Sent by Vistrial - Automated customer reactivation for home services'}
            </Text>
            <Text style={footerLinks}>
              <Link href="https://vistrial.com" style={link}>
                Website
              </Link>
              {' • '}
              <Link href="https://vistrial.com/help" style={link}>
                Help Center
              </Link>
              {' • '}
              <Link href="https://vistrial.com/unsubscribe" style={link}>
                Unsubscribe
              </Link>
            </Text>
            <Text style={footerAddress}>
              Vistrial, Inc.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
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

const header = {
  padding: '24px 32px',
  borderBottom: '1px solid #e6ebf1',
};

const content = {
  padding: '32px',
};

const footer = {
  padding: '24px 32px',
  borderTop: '1px solid #e6ebf1',
  textAlign: 'center' as const,
};

const footerTextStyle = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '0 0 8px',
};

const footerLinks = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '0 0 8px',
};

const footerAddress = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '0',
};

const link = {
  color: '#5347d1',
  textDecoration: 'none',
};
