// ============================================
// WELCOME EMAIL TEMPLATE
// Sent when a new user signs up
// ============================================

import {
  Button,
  Heading,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface WelcomeEmailProps {
  firstName: string;
  loginUrl: string;
}

export function WelcomeEmail({ firstName, loginUrl }: WelcomeEmailProps) {
  return (
    <BaseLayout preview={`Welcome to Vistrial, ${firstName}!`}>
      <Heading style={heading}>Welcome to Vistrial! 🎉</Heading>

      <Text style={paragraph}>Hi {firstName},</Text>

      <Text style={paragraph}>
        Thanks for signing up! You&apos;re now ready to start bringing back your old
        customers with automated SMS and email campaigns.
      </Text>

      <Text style={paragraph}>Here&apos;s how to get started:</Text>

      <Section style={listSection}>
        <Text style={listItem}>
          <strong>1. Upload your contacts</strong> - Export from your CRM or use a spreadsheet
        </Text>
        <Text style={listItem}>
          <strong>2. Pick a campaign template</strong> - We&apos;ve got proven sequences ready to go
        </Text>
        <Text style={listItem}>
          <strong>3. Customize and launch</strong> - Add your business details and hit send
        </Text>
      </Section>

      <Section style={buttonSection}>
        <Button style={button} href={loginUrl}>
          Go to Dashboard
        </Button>
      </Section>

      <Text style={paragraph}>
        Questions? Just reply to this email - we&apos;re here to help.
      </Text>

      <Text style={signature}>
        — The Vistrial Team
      </Text>
    </BaseLayout>
  );
}

// Styles
const heading = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '32px',
  margin: '0 0 24px',
};

const paragraph = {
  color: '#4b5563',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

const listSection = {
  margin: '24px 0',
  padding: '16px 24px',
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
};

const listItem = {
  color: '#4b5563',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 8px',
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#5400ff',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  padding: '12px 24px',
};

const signature = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '24px 0 0',
};

// Default props for preview
WelcomeEmail.PreviewProps = {
  firstName: 'John',
  loginUrl: 'https://app.vistrial.com/dashboard',
} as WelcomeEmailProps;

export default WelcomeEmail;
