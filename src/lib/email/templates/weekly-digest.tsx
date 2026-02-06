// ============================================
// WEEKLY DIGEST EMAIL
// Sent every Monday with campaign stats
// ============================================

import {
  Button,
  Heading,
  Section,
  Text,
  Row,
  Column,
} from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface WeeklyDigestEmailProps {
  firstName: string;
  weekOf: string;
  stats: {
    messagesSent: number;
    responses: number;
    responseRate: number;
    bookings: number;
    revenue: number;
  };
  topWorkflow: {
    name: string;
    responses: number;
  } | null;
  dashboardUrl: string;
}

export function WeeklyDigestEmail({
  firstName,
  weekOf,
  stats,
  topWorkflow,
  dashboardUrl,
}: WeeklyDigestEmailProps) {
  return (
    <BaseLayout preview={`Your Vistrial weekly report - ${weekOf}`}>
      <Heading style={heading}>📊 Your Weekly Report</Heading>

      <Text style={subheading}>Week of {weekOf}</Text>

      <Text style={paragraph}>Hi {firstName},</Text>

      <Text style={paragraph}>
        Here&apos;s how your reactivation campaigns performed this week:
      </Text>

      {/* Stats Grid */}
      <Section style={statsGrid}>
        <Row>
          <Column style={statBox}>
            <Text style={statValue}>{stats.messagesSent}</Text>
            <Text style={statLabel}>Messages Sent</Text>
          </Column>
          <Column style={statBox}>
            <Text style={statValue}>{stats.responses}</Text>
            <Text style={statLabel}>Responses</Text>
          </Column>
        </Row>
        <Row>
          <Column style={statBox}>
            <Text style={statValue}>{stats.responseRate}%</Text>
            <Text style={statLabel}>Response Rate</Text>
          </Column>
          <Column style={statBox}>
            <Text style={statValue}>{stats.bookings}</Text>
            <Text style={statLabel}>Bookings</Text>
          </Column>
        </Row>
      </Section>

      {/* Revenue Highlight */}
      {stats.revenue > 0 && (
        <Section style={revenueBox}>
          <Text style={revenueLabel}>Estimated Revenue Generated</Text>
          <Text style={revenueValue}>${stats.revenue.toLocaleString()}</Text>
        </Section>
      )}

      {/* Top Workflow */}
      {topWorkflow && (
        <Section style={topWorkflowBox}>
          <Text style={topWorkflowLabel}>🏆 Top Performing Campaign</Text>
          <Text style={topWorkflowName}>{topWorkflow.name}</Text>
          <Text style={topWorkflowStat}>{topWorkflow.responses} responses</Text>
        </Section>
      )}

      <Section style={buttonSection}>
        <Button style={button} href={dashboardUrl}>
          View Full Analytics
        </Button>
      </Section>

      <Text style={signature}>
        Keep up the great work!
        <br />— The Vistrial Team
      </Text>
    </BaseLayout>
  );
}

const heading = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '32px',
  margin: '0 0 8px',
};

const subheading = {
  color: '#6b7280',
  fontSize: '14px',
  margin: '0 0 24px',
};

const paragraph = {
  color: '#4b5563',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

const statsGrid = {
  margin: '24px 0',
};

const statBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '16px',
  textAlign: 'center' as const,
  margin: '4px',
};

const statValue = {
  color: '#1f2937',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0 0 4px',
};

const statLabel = {
  color: '#6b7280',
  fontSize: '12px',
  textTransform: 'uppercase' as const,
  margin: '0',
};

const revenueBox = {
  backgroundColor: '#ecfdf5',
  borderRadius: '8px',
  padding: '24px',
  textAlign: 'center' as const,
  margin: '24px 0',
};

const revenueLabel = {
  color: '#166534',
  fontSize: '14px',
  margin: '0 0 8px',
};

const revenueValue = {
  color: '#166534',
  fontSize: '36px',
  fontWeight: '700',
  margin: '0',
};

const topWorkflowBox = {
  backgroundColor: '#fef3c7',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
};

const topWorkflowLabel = {
  color: '#92400e',
  fontSize: '12px',
  fontWeight: '600',
  margin: '0 0 8px',
};

const topWorkflowName = {
  color: '#92400e',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 4px',
};

const topWorkflowStat = {
  color: '#b45309',
  fontSize: '14px',
  margin: '0',
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

const signature = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '24px 0 0',
};

WeeklyDigestEmail.PreviewProps = {
  firstName: 'John',
  weekOf: 'January 27, 2025',
  stats: {
    messagesSent: 847,
    responses: 67,
    responseRate: 7.9,
    bookings: 23,
    revenue: 5750,
  },
  topWorkflow: {
    name: 'We Miss You - 90 Days',
    responses: 34,
  },
  dashboardUrl: 'https://app.vistrial.com/analytics',
} as WeeklyDigestEmailProps;

export default WeeklyDigestEmail;
