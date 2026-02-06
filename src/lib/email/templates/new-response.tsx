// ============================================
// NEW RESPONSE NOTIFICATION EMAIL
// Sent when a contact responds to a campaign
// ============================================

import {
  Button,
  Heading,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface NewResponseEmailProps {
  firstName: string;
  contactName: string;
  contactPhone: string;
  message: string;
  workflowName: string;
  inboxUrl: string;
}

export function NewResponseEmail({
  firstName,
  contactName,
  contactPhone,
  message,
  workflowName,
  inboxUrl,
}: NewResponseEmailProps) {
  return (
    <BaseLayout preview={`New response from ${contactName}`}>
      <Heading style={heading}>🔔 New Response!</Heading>

      <Text style={paragraph}>Hi {firstName},</Text>

      <Text style={paragraph}>
        <strong>{contactName}</strong> just responded to your{' '}
        <strong>{workflowName}</strong> campaign.
      </Text>

      <Section style={messageBox}>
        <Text style={messageLabel}>Their message:</Text>
        <Text style={messageContent}>&quot;{message}&quot;</Text>
        <Text style={messagePhone}>{contactPhone}</Text>
      </Section>

      <Section style={buttonSection}>
        <Button style={button} href={inboxUrl}>
          Reply Now
        </Button>
      </Section>

      <Text style={tipText}>
        💡 <strong>Tip:</strong> Fast responses convert better! Try to reply
        within a few hours.
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

const messageBox = {
  backgroundColor: '#f0fdf4',
  border: '1px solid #86efac',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
};

const messageLabel = {
  color: '#166534',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  margin: '0 0 8px',
};

const messageContent = {
  color: '#166534',
  fontSize: '18px',
  fontStyle: 'italic',
  lineHeight: '28px',
  margin: '0 0 8px',
};

const messagePhone = {
  color: '#4ade80',
  fontSize: '14px',
  margin: '0',
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#16a34a',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  padding: '12px 24px',
};

const tipText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0',
  padding: '16px',
  backgroundColor: '#fef3c7',
  borderRadius: '6px',
};

NewResponseEmail.PreviewProps = {
  firstName: 'John',
  contactName: 'Sarah Miller',
  contactPhone: '+1 (555) 123-4567',
  message: "Yes! I'd love to schedule a cleaning for next week.",
  workflowName: 'We Miss You',
  inboxUrl: 'https://app.vistrial.com/inbox?conversation=123',
} as NewResponseEmailProps;

export default NewResponseEmail;
