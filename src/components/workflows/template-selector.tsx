// @ts-nocheck
'use client';

// ============================================
// TEMPLATE SELECTOR
// Grid of workflow templates
// ============================================

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  Heart,
  Sun,
  Star,
  Users,
  ArrowRight,
  Plus,
  MessageSquare,
  Phone,
} from 'lucide-react';
import type { WorkflowTemplate, WorkflowStep } from '@/types/workflows';

interface TemplateSelectorProps {
  templates: WorkflowTemplate[];
  onSelect: (template: WorkflowTemplate) => void;
  onStartFromScratch: () => void;
}

const categoryIcons: Record<string, React.ElementType> = {
  reactivation: RefreshCw,
  retention: Heart,
  seasonal: Sun,
  review_request: Star,
  referral: Users,
  win_back: ArrowRight,
};

const categoryColors: Record<string, string> = {
  reactivation: 'bg-blue-500/20 text-blue-400',
  retention: 'bg-pink-500/20 text-pink-400',
  seasonal: 'bg-yellow-500/20 text-yellow-400',
  review_request: 'bg-purple-500/20 text-purple-400',
  referral: 'bg-green-500/20 text-green-400',
  win_back: 'bg-orange-500/20 text-orange-400',
};

export function TemplateSelector({
  templates,
  onSelect,
  onStartFromScratch,
}: TemplateSelectorProps) {
  return (
    <div className="space-y-6">
      {/* Start from scratch */}
      <Card
        className="border-dashed border-2 border-gray-300 bg-gray-500 cursor-pointer hover:border-brand-500/50 transition-colors"
        onClick={onStartFromScratch}
      >
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3">
              <Plus className="h-6 w-6 text-gray-400" />
            </div>
            <p className="font-medium text-gray-900">Start from Scratch</p>
            <p className="text-sm text-gray-400">
              Build a custom workflow step by step
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Templates grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pre-built Templates</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const Icon = categoryIcons[template.category] || RefreshCw;
            const steps = template.steps as WorkflowStep[];
            const smsCount = steps?.filter((s) => s.type === 'sms').length || 0;
            const voiceCount = steps?.filter((s) => s.type === 'voice_drop').length || 0;

            return (
              <Card
                key={template.id}
                className="bg-white/80 border-gray-200 cursor-pointer hover:border-brand-500/50 transition-all"
                onClick={() => onSelect(template)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div
                      className={`p-2 rounded-lg ${
                        categoryColors[template.category] || 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="text-xs border-gray-300 text-gray-400">
                      {steps?.length || 0} steps
                    </Badge>
                  </div>
                  <CardTitle className="text-lg mt-3 text-gray-900">{template.name}</CardTitle>
                  <CardDescription className="line-clamp-2 text-gray-400">
                    {template.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    {smsCount > 0 && (
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" />
                        {smsCount} SMS
                      </div>
                    )}
                    {voiceCount > 0 && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        {voiceCount} Voice
                      </div>
                    )}
                  </div>
                  <Button className="w-full mt-4 bg-brand-600/20 text-brand-400 hover:bg-brand-600 hover:text-gray-900 border border-brand-500/30">
                    Use Template
                  </Button>
                </CardContent>
              </Card>
            );
          })}

          {templates.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              No templates available yet. Start from scratch to create your first workflow.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
