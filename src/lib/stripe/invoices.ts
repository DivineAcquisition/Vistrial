// ============================================
// STRIPE INVOICE MANAGEMENT
// ============================================

import { getStripeServerClient } from './server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export interface InvoiceData {
  id: string;
  number: string | null;
  status: string;
  amount: number;
  currency: string;
  created: string;
  dueDate: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  periodStart: string;
  periodEnd: string;
  lines: Array<{ description: string; quantity: number; amount: number }>;
}

export interface PaymentMethodData {
  id: string;
  type: string;
  card?: { brand: string; last4: string; expMonth: number; expYear: number };
  isDefault: boolean;
}

export async function getInvoices(customerId: string, limit: number = 24): Promise<InvoiceData[]> {
  try {
    const stripe = getStripeServerClient();
    const invoices = await stripe.invoices.list({ customer: customerId, limit });

    return invoices.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status || 'unknown',
      amount: (invoice.amount_paid || 0) / 100,
      currency: invoice.currency,
      created: new Date(invoice.created * 1000).toISOString(),
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      paidAt: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      invoicePdfUrl: invoice.invoice_pdf || null,
      periodStart: new Date(invoice.period_start * 1000).toISOString(),
      periodEnd: new Date(invoice.period_end * 1000).toISOString(),
      lines: (invoice.lines?.data || []).map((line) => ({
        description: line.description || 'Subscription',
        quantity: line.quantity || 1,
        amount: line.amount / 100,
      })),
    }));
  } catch (error) {
    console.error('Failed to fetch invoices:', error);
    return [];
  }
}

export async function getUpcomingInvoice(customerId: string): Promise<InvoiceData | null> {
  try {
    const stripe = getStripeServerClient();
    const invoice = await stripe.invoices.retrieveUpcoming({ customer: customerId });

    return {
      id: 'upcoming',
      number: null,
      status: 'upcoming',
      amount: (invoice.amount_due || 0) / 100,
      currency: invoice.currency,
      created: new Date().toISOString(),
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      paidAt: null,
      hostedInvoiceUrl: null,
      invoicePdfUrl: null,
      periodStart: new Date(invoice.period_start * 1000).toISOString(),
      periodEnd: new Date(invoice.period_end * 1000).toISOString(),
      lines: invoice.lines.data.map((line) => ({
        description: line.description || 'Subscription',
        quantity: line.quantity || 1,
        amount: line.amount / 100,
      })),
    };
  } catch {
    return null;
  }
}

export async function getPaymentMethods(customerId: string): Promise<PaymentMethodData[]> {
  try {
    const stripe = getStripeServerClient();
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if ((customer as any).deleted) return [];

    const paymentMethods = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
    const defaultId = typeof (customer as any).invoice_settings?.default_payment_method === 'string'
      ? (customer as any).invoice_settings.default_payment_method
      : (customer as any).invoice_settings?.default_payment_method?.id;

    return paymentMethods.data.map((pm) => ({
      id: pm.id,
      type: pm.type,
      card: pm.card ? {
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
      } : undefined,
      isDefault: pm.id === defaultId,
    }));
  } catch (error) {
    console.error('Failed to fetch payment methods:', error);
    return [];
  }
}

export async function getBillingEvents(organizationId: string, limit: number = 50) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('billing_events')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}
