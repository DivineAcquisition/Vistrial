// ============================================
// OPT-IN WORKFLOW PAGE
// Visual diagram for Telnyx verification
// ============================================

import { Metadata } from 'next';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  RiCheckLine,
  RiArrowDownLine,
  RiGroupLine,
  RiUpload2Line,
  RiShieldCheckLine,
  RiMessage2Line,
  RiThumbUpLine,
  RiCloseCircleLine,
  RiDatabase2Line,
} from '@remixicon/react';

export const metadata: Metadata = {
  title: 'SMS Opt-In Workflow',
  description: 'How Vistrial handles SMS consent and opt-in for customer reactivation campaigns.',
};

export default function OptInWorkflowPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-12">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge className="mb-4">SMS Compliance</Badge>
          <h1 className="text-3xl font-bold mb-4">
            Vistrial SMS Opt-In Workflow
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Customer Reactivation Campaigns for Home Service Businesses
          </p>
        </div>

        {/* Workflow Diagram */}
        <div className="space-y-4">
          {/* Step 1: Existing Relationship */}
          <Card className="border-2 border-green-200 bg-green-50/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0">
                  <RiGroupLine className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg">1. Existing Customer Relationship</h3>
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                      Consent Basis
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mb-3">
                    Customer provides phone number during normal business interaction:
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <RiCheckLine className="h-4 w-4 text-green-600" />
                      <span>Service booking or appointment</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <RiCheckLine className="h-4 w-4 text-green-600" />
                      <span>Invoice or payment processing</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <RiCheckLine className="h-4 w-4 text-green-600" />
                      <span>Account creation</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <RiCheckLine className="h-4 w-4 text-green-600" />
                      <span>In-person service visit</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Arrow */}
          <div className="flex justify-center">
            <RiArrowDownLine className="h-8 w-8 text-muted-foreground" />
          </div>

          {/* Step 2: CRM Storage */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <RiDatabase2Line className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">2. Business Stores Customer in CRM</h3>
                  <p className="text-muted-foreground mb-3">
                    Customer information is stored in the business&apos;s existing system:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Jobber</Badge>
                    <Badge variant="secondary">Housecall Pro</Badge>
                    <Badge variant="secondary">ServiceTitan</Badge>
                    <Badge variant="secondary">QuickBooks</Badge>
                    <Badge variant="secondary">Spreadsheet/CSV</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Arrow */}
          <div className="flex justify-center">
            <RiArrowDownLine className="h-8 w-8 text-muted-foreground" />
          </div>

          {/* Step 3: Upload to Vistrial */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0">
                  <RiUpload2Line className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">3. Business Owner Uploads to Vistrial</h3>
                  <p className="text-muted-foreground">
                    Business owner exports customer list from their CRM and uploads to Vistrial platform via secure CSV import.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Arrow */}
          <div className="flex justify-center">
            <RiArrowDownLine className="h-8 w-8 text-muted-foreground" />
          </div>

          {/* Step 4: Attestation */}
          <Card className="border-2 border-amber-200 bg-amber-50/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0">
                  <RiShieldCheckLine className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg">4. Compliance Attestation</h3>
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                      Required
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mb-4">
                    Before any messages are sent, the business owner must confirm:
                  </p>
                  <div className="bg-white border-2 border-amber-300 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded border-2 border-amber-600 bg-amber-600 flex items-center justify-center mt-0.5">
                        <RiCheckLine className="h-3 w-3 text-white" />
                      </div>
                      <p className="text-sm font-medium">
                        &quot;I confirm that all contacts in this list are existing customers who have 
                        previously done business with my company and voluntarily provided their 
                        phone number. I have a legitimate business relationship with each contact 
                        and am authorized to send them marketing communications.&quot;
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Arrow */}
          <div className="flex justify-center">
            <RiArrowDownLine className="h-8 w-8 text-muted-foreground" />
          </div>

          {/* Step 5: Message Sent */}
          <Card className="border-2 border-blue-200 bg-blue-50/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <RiMessage2Line className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg">5. SMS Sent to Customer</h3>
                    <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                      With Opt-Out
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mb-4">
                    Personalized reactivation message with clear opt-out instructions:
                  </p>
                  <div className="bg-blue-600 text-white rounded-2xl rounded-bl-md p-4 max-w-sm">
                    <p className="text-sm">
                      Hey Sarah! It&apos;s been a while since your last visit with Sparkle Cleaning Co. 
                      We&apos;d love to have you back! Reply YES to schedule or STOP to opt out.
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <RiCheckLine className="h-3 w-3 text-green-600" />
                      Personalized with name
                    </span>
                    <span className="flex items-center gap-1">
                      <RiCheckLine className="h-3 w-3 text-green-600" />
                      Business identified
                    </span>
                    <span className="flex items-center gap-1">
                      <RiCheckLine className="h-3 w-3 text-green-600" />
                      Clear opt-out (STOP)
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Arrow */}
          <div className="flex justify-center">
            <RiArrowDownLine className="h-8 w-8 text-muted-foreground" />
          </div>

          {/* Step 6: Response Handling */}
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Positive Response */}
            <Card className="border-2 border-green-200 bg-green-50/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0">
                    <RiThumbUpLine className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Customer Replies YES</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Conversation continues in inbox
                    </p>
                    <div className="bg-gray-200 rounded-2xl rounded-br-md p-3 text-sm">
                      &quot;YES&quot;
                    </div>
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                      <RiCheckLine className="h-3 w-3" />
                      Lead captured, business notified
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Opt-Out Response */}
            <Card className="border-2 border-red-200 bg-red-50/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0">
                    <RiCloseCircleLine className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Customer Replies STOP</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Immediately unsubscribed
                    </p>
                    <div className="bg-gray-200 rounded-2xl rounded-br-md p-3 text-sm">
                      &quot;STOP&quot;
                    </div>
                    <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                      <RiCheckLine className="h-3 w-3" />
                      No further messages sent
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Additional Compliance Info */}
        <div className="mt-12 space-y-6">
          <h2 className="text-xl font-bold text-center">Additional Compliance Measures</h2>
          
          <div className="grid sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">⏰</span>
                </div>
                <h3 className="font-semibold mb-1">Send Window</h3>
                <p className="text-sm text-muted-foreground">
                  Messages only sent 9am-8pm in recipient&apos;s local timezone
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">📊</span>
                </div>
                <h3 className="font-semibold mb-1">Frequency Limits</h3>
                <p className="text-sm text-muted-foreground">
                  Maximum 3-5 messages per campaign, minimum 2-day gaps
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">🛑</span>
                </div>
                <h3 className="font-semibold mb-1">Auto Stop on Reply</h3>
                <p className="text-sm text-muted-foreground">
                  Campaign stops automatically when customer responds
                </p>
              </CardContent>
            </Card>
          </div>

          {/* STOP Keywords */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-3">Recognized Opt-Out Keywords</h3>
              <p className="text-sm text-muted-foreground mb-3">
                The following keywords are automatically detected and processed immediately:
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="destructive">STOP</Badge>
                <Badge variant="destructive">UNSUBSCRIBE</Badge>
                <Badge variant="destructive">CANCEL</Badge>
                <Badge variant="destructive">END</Badge>
                <Badge variant="destructive">QUIT</Badge>
                <Badge variant="destructive">STOPALL</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Help Response */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-3">HELP Response</h3>
              <p className="text-sm text-muted-foreground mb-3">
                When a customer texts HELP, they receive:
              </p>
              <div className="bg-blue-600 text-white rounded-2xl rounded-bl-md p-4 max-w-md">
                <p className="text-sm">
                  [Business Name] uses Vistrial to send appointment reminders and offers. 
                  Reply STOP to unsubscribe. For support, contact support@vistrial.io or 
                  visit vistrial.io/help. Msg &amp; data rates may apply.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>Vistrial, Inc. • Baltimore, MD</p>
          <p className="mt-1">
            <a href="https://vistrial.io/privacy" className="underline">Privacy Policy</a>
            {' • '}
            <a href="https://vistrial.io/terms" className="underline">Terms of Service</a>
            {' • '}
            <a href="mailto:compliance@vistrial.io" className="underline">compliance@vistrial.io</a>
          </p>
          <p className="mt-4 text-xs">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  );
}
