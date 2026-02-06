// ============================================
// PASSWORD RESET EMAIL TEMPLATE
// ============================================

import {
  Button,
  Heading,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface PasswordResetEmailProps {
  firstName: string;
  resetUrl: string;
}

export function PasswordResetEmail({ firstName, resetUrl }: PasswordResetEmailProps) {
  return (
    <BaseLayout preview="Reset your Vistrial password">
      <Heading style={heading}>Reset your password</Heading>

      <Text style={paragraph}>Hi {firstName},</Text>

      <Text style={paragraph}>
        We received a request to reset your Vistrial password. Click the button
        below to create a new password.
      </Text>

      <Section style={buttonSection}>
        <Button style={button} href={resetUrl}>
          Reset Password
        </Button>
      </Section>

      <Text style={paragraph}>
        This link will expire in 1 hour. If you didn&apos;t request this, you can
        safely ignore this email.
      </Text>

      <Text style={smallText}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
        <br />
        {resetUrl}
      </Text>
    </BaseLayout>
  );
}

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

const smallText = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '20px',
  margin: '24px 0 0',
  wordBreak: 'break-all' as const,
};

PasswordResetEmail.PreviewProps = {
  firstName: 'John',
  resetUrl: 'https://app.vistrial.com/reset-password?token=abc123',
} as PasswordResetEmailProps;

export default PasswordResetEmail;
