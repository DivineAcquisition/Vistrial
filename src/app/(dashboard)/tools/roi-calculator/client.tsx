'use client';

// ============================================
// ROI CALCULATOR — Interactive Client Component
// ============================================

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

interface CalcState {
  bizName: string;
  revenue: string;
  clientsLost: number;
  avgValue: number;
  monthsRemaining: number;
  hrsData: number;
  hrsReport: number;
  hrsComms: number;
  teamRate: number;
  hrsOwner: number;
  ownerRate: number;
}

function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

export function ROICalculatorClient({ businessName }: { businessName: string }) {
  const [s, setS] = useState<CalcState>({
    bizName: businessName,
    revenue: '',
    clientsLost: 0,
    avgValue: 0,
    monthsRemaining: 6,
    hrsData: 0,
    hrsReport: 0,
    hrsComms: 0,
    teamRate: 50,
    hrsOwner: 0,
    ownerRate: 150,
  });

  const up = useCallback((field: keyof CalcState, value: string | number) => {
    setS((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Calculations
  const c1 = s.clientsLost * s.avgValue * s.monthsRemaining;
  const totalHrs = s.hrsData + s.hrsReport + s.hrsComms;
  const c2 = totalHrs * s.teamRate * 52;
  const c3 = s.hrsOwner * s.ownerRate * 52;
  const total = c1 + c2 + c3;

  const rev = parseFloat(s.revenue.replace(/[^0-9.]/g, '')) || 0;
  const revPercent = total > 0 && rev > 0 ? Math.round((total / (rev * 12)) * 100) : 0;

  const fullBuildCost = 12964;
  const roiX = total > 0 ? Math.round((total / fullBuildCost) * 10) / 10 : 0;
  const paybackWeeks = total > 0 ? Math.max(1, Math.round((fullBuildCost / total) * 52)) : 0;

  return (
    <div className="space-y-4 pb-8">
      {/* Business Info */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="pt-5 space-y-3">
          <Row label="Business name">
            <Input value={s.bizName} onChange={(e) => up('bizName', e.target.value)} placeholder="Enter name" className="text-right" />
          </Row>
          <Row label="Monthly revenue">
            <Input value={s.revenue} onChange={(e) => up('revenue', e.target.value)} placeholder="$0" className="text-right" />
          </Row>
        </CardContent>
      </Card>

      {/* Section 1: Churn */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader color="#A32D2D" label="1. Revenue leak from preventable churn" />

          <Row label="Clients lost in last 12 months" sub="That could have been saved with early warning">
            <Input type="number" min={0} value={s.clientsLost || ''} onChange={(e) => up('clientsLost', +e.target.value || 0)} className="text-right" />
          </Row>
          <Row label="Average monthly value per client" sub="Retainer, project fee, or contract value/mo">
            <Input type="number" min={0} value={s.avgValue || ''} onChange={(e) => up('avgValue', +e.target.value || 0)} className="text-right" />
          </Row>
          <Row label="Average months remaining on contract" sub="How many months of revenue lost per churn">
            <Input type="number" min={1} max={24} value={s.monthsRemaining || ''} onChange={(e) => up('monthsRemaining', +e.target.value || 6)} className="text-right" />
          </Row>

          <Formula parts={[
            { val: String(s.clientsLost), label: 'clients lost' },
            { val: fmt(s.avgValue), label: '/mo' },
            { val: String(s.monthsRemaining), label: 'months' },
            { val: fmt(c1), label: '' },
          ]} />

          <Subtotal label="Annual churn cost" value={fmt(c1)} color="red" />
        </CardContent>
      </Card>

      {/* Section 2: Labor */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader color="#854F0B" label="2. Labor wasted on manual operations" />

          <Row label="Hours/week on manual data transfers" sub="Copy-paste between tools, updating spreadsheets">
            <Input type="number" min={0} value={s.hrsData || ''} onChange={(e) => up('hrsData', +e.target.value || 0)} className="text-right" />
          </Row>
          <Row label="Hours/week on manual reporting" sub="Building reports, checking dashboards, status updates">
            <Input type="number" min={0} value={s.hrsReport || ''} onChange={(e) => up('hrsReport', +e.target.value || 0)} className="text-right" />
          </Row>
          <Row label="Hours/week on manual client comms" sub="Check-ins, follow-ups, onboarding steps done by hand">
            <Input type="number" min={0} value={s.hrsComms || ''} onChange={(e) => up('hrsComms', +e.target.value || 0)} className="text-right" />
          </Row>
          <Row label="Blended team hourly rate" sub="Average cost per hour across team">
            <Input type="number" min={0} value={s.teamRate || ''} onChange={(e) => up('teamRate', +e.target.value || 0)} className="text-right" />
          </Row>

          <Formula parts={[
            { val: String(totalHrs), label: 'hrs/wk' },
            { val: fmt(s.teamRate), label: '/hr' },
            { val: '52', label: 'weeks' },
            { val: fmt(c2), label: '' },
          ]} />

          <Subtotal label="Annual labor waste" value={fmt(c2)} color="amber" />
        </CardContent>
      </Card>

      {/* Section 3: Founder */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader color="#993C1D" label="3. Founder capacity lost to bottleneck" />

          <Row label="Owner hours/week on operational work" sub="Escalations, approvals, tasks that shouldn't need them">
            <Input type="number" min={0} value={s.hrsOwner || ''} onChange={(e) => up('hrsOwner', +e.target.value || 0)} className="text-right" />
          </Row>
          <Row label="Owner effective hourly value" sub="What their time is worth on growth/sales instead">
            <Input type="number" min={0} value={s.ownerRate || ''} onChange={(e) => up('ownerRate', +e.target.value || 0)} className="text-right" />
          </Row>

          <Formula parts={[
            { val: String(s.hrsOwner), label: 'hrs/wk' },
            { val: fmt(s.ownerRate), label: '/hr' },
            { val: '52', label: 'weeks' },
            { val: fmt(c3), label: '' },
          ]} />

          <Subtotal label="Annual opportunity cost" value={fmt(c3)} color="coral" />
        </CardContent>
      </Card>

      {/* Total */}
      <div className="border-2 border-red-700 rounded-xl p-6 text-center bg-gray-50">
        <p className="text-sm text-gray-500 mb-1">Total annual cost of broken operations</p>
        <p className="text-4xl font-semibold text-red-700">{fmt(total)}</p>
        {revPercent > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            That is {revPercent}% of annual revenue going to operational waste
          </p>
        )}
      </div>

      {/* ROI Comparison */}
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-gray-900 mb-4">Investment comparison</p>

          <div className="space-y-0">
            <ROIRow label="Annual cost of doing nothing" value={fmt(total)} />
            <div className="h-px bg-gray-200 my-2" />
            <ROIRow label="Starter build ($4,500 + $497/mo x 12)" value="$10,464" />
            <ROIRow label="Core build ($5,500 + $497/mo x 12)" value="$11,464" />
            <ROIRow label="Full build ($7,000 + $497/mo x 12)" value="$12,964" />
            <div className="h-px bg-gray-200 my-2" />
            <ROIRow
              label="Full build ROI (annual savings / cost)"
              value={total > 0 ? `${roiX}x return` : '\u2014'}
              valueColor="#3B6D11"
            />
          </div>

          <div className="mt-3 text-center text-sm font-medium text-green-800 bg-gray-50 rounded-lg p-3">
            {total > 0
              ? `Full build pays for itself in ~${paybackWeeks} weeks`
              : 'Enter numbers above to calculate payback period'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ──

function SectionHeader({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
      <span className="text-sm font-medium text-gray-900">{label}</span>
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_140px] gap-3 items-center mb-3">
      <div>
        <div className="text-[13px] text-gray-600 leading-snug">{label}</div>
        {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Formula({ parts }: { parts: { val: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap px-3 py-2.5 bg-gray-50 rounded-lg mt-3 text-xs text-gray-500">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && i < parts.length - 1 && <span className="text-gray-300 mx-0.5">x</span>}
          {i === parts.length - 1 && <span className="text-gray-300 mx-0.5">=</span>}
          <span className="font-medium text-[13px] text-gray-900">{p.val}</span>
          {p.label && <span>{p.label}</span>}
        </span>
      ))}
    </div>
  );
}

function Subtotal({ label, value, color }: { label: string; value: string; color: 'red' | 'amber' | 'coral' }) {
  const colors = {
    red: { label: 'text-red-800', value: 'text-red-800' },
    amber: { label: 'text-amber-800', value: 'text-amber-800' },
    coral: { label: 'text-orange-800', value: 'text-orange-800' },
  };
  const c = colors[color];

  return (
    <div className="flex justify-between items-center pt-3 border-t border-gray-200 mt-3">
      <span className={`text-[13px] font-medium ${c.label}`}>{label}</span>
      <span className={`text-lg font-medium ${c.value}`}>{value}</span>
    </div>
  );
}

function ROIRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-[13px]">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  );
}
