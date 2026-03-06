'use client';

// ============================================
// STEP CONFIG MODAL
// Configure individual workflow steps with email support
// ============================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { RiMessage2Line, RiMailLine, RiPhoneLine, RiTimeLine } from '@remixicon/react';
import type { WorkflowStep } from '@/types/workflows';
import { TEMPLATE_VARIABLES } from '@/types/workflows';

interface StepConfigModalProps {
  step: WorkflowStep;
  isFirstStep: boolean;
  onSave: (step: WorkflowStep) => void;
  onClose: () => void;
}

const VOICE_OPTIONS = [
  { id: 'rachel', name: 'Rachel', description: 'Friendly, professional female voice' },
  { id: 'bella', name: 'Bella', description: 'Warm, conversational female voice' },
  { id: 'antoni', name: 'Antoni', description: 'Professional male voice' },
  { id: 'adam', name: 'Adam', description: 'Friendly, casual male voice' },
];

export function StepConfigModal({
  step,
  isFirstStep,
  onSave,
  onClose,
}: StepConfigModalProps) {
  const [editedStep, setEditedStep] = useState<WorkflowStep>(step);

  const handleChange = (field: keyof WorkflowStep, value: string | number) => {
    setEditedStep((prev) => ({ ...prev, [field]: value }));
  };

  const insertVariable = (field: 'template' | 'email_subject' | 'email_body' | 'voice_script', variable: string) => {
    const currentValue = editedStep[field] || '';
    handleChange(field, currentValue + `{{${variable}}}`);
  };

  const handleSave = () => {
    onSave(editedStep);
  };

  // Calculate costs
  const smsSegments = Math.ceil((editedStep.template?.length || 0) / 160);
  const smsCost = (smsSegments * 0.015).toFixed(3);
  const emailCost = '0.001'; // Roughly $1 per 1000 emails
  const voiceCost = '0.05';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step.type === 'sms' && <RiMessage2Line className="h-5 w-5 text-blue-600" />}
            {step.type === 'email' && <RiMailLine className="h-5 w-5 text-purple-600" />}
            {step.type === 'voice_drop' && <RiPhoneLine className="h-5 w-5 text-green-600" />}
            Configure {step.type === 'sms' ? 'SMS Message' : step.type === 'email' ? 'Email' : 'Voice Drop'}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="content" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="timing">Timing</TabsTrigger>
            {step.type === 'voice_drop' && (
              <TabsTrigger value="voice">Voice</TabsTrigger>
            )}
            {step.type !== 'voice_drop' && (
              <TabsTrigger value="preview">Preview</TabsTrigger>
            )}
          </TabsList>

          {/* CONTENT TAB */}
          <TabsContent value="content" className="space-y-4 mt-4">
            {/* Template Variables */}
            <div>
              <Label className="text-xs text-muted-foreground">
                Click to insert variable
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {TEMPLATE_VARIABLES.map((v) => (
                  <Badge
                    key={v.key}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted"
                    onClick={() =>
                      insertVariable(
                        step.type === 'sms'
                          ? 'template'
                          : step.type === 'email'
                          ? 'email_body'
                          : 'voice_script',
                        v.key
                      )
                    }
                  >
                    {`{{${v.key}}}`}
                  </Badge>
                ))}
              </div>
            </div>

            {/* SMS Content */}
            {step.type === 'sms' && (
              <div className="space-y-2">
                <Label htmlFor="template">Message</Label>
                <Textarea
                  id="template"
                  value={editedStep.template || ''}
                  onChange={(e) => handleChange('template', e.target.value)}
                  placeholder="Hi {{first_name}}, it's been a while since your last visit..."
                  rows={4}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{editedStep.template?.length || 0} characters</span>
                  <span>
                    {smsSegments} segment{smsSegments !== 1 ? 's' : ''} • ~${smsCost} per contact
                  </span>
                </div>
              </div>
            )}

            {/* Email Content */}
            {step.type === 'email' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email_subject">Subject Line</Label>
                  <Input
                    id="email_subject"
                    value={editedStep.email_subject || ''}
                    onChange={(e) => handleChange('email_subject', e.target.value)}
                    placeholder="We miss you, {{first_name}}!"
                  />
                  <div className="flex gap-2">
                    {TEMPLATE_VARIABLES.slice(0, 3).map((v) => (
                      <Badge
                        key={v.key}
                        variant="outline"
                        className="cursor-pointer hover:bg-muted text-xs"
                        onClick={() => insertVariable('email_subject', v.key)}
                      >
                        {v.label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email_body">Email Body</Label>
                  <Textarea
                    id="email_body"
                    value={editedStep.email_body || ''}
                    onChange={(e) => handleChange('email_body', e.target.value)}
                    placeholder={`Hi {{first_name}},

It's been a while since your last visit with {{business_name}}. We'd love to have you back!

Ready to schedule? Just reply to this email or click the button below.`}
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use blank lines to create paragraphs. ~${emailCost} per email.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email_cta_text">Button Text (optional)</Label>
                    <Input
                      id="email_cta_text"
                      value={editedStep.email_cta_text || ''}
                      onChange={(e) => handleChange('email_cta_text', e.target.value)}
                      placeholder="Book Now"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email_cta_url">Button URL</Label>
                    <Input
                      id="email_cta_url"
                      value={editedStep.email_cta_url || ''}
                      onChange={(e) => handleChange('email_cta_url', e.target.value)}
                      placeholder="{{booking_link}}"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Voice Drop Content */}
            {step.type === 'voice_drop' && (
              <div className="space-y-2">
                <Label htmlFor="voice_script">Voice Script</Label>
                <Textarea
                  id="voice_script"
                  value={editedStep.voice_script || ''}
                  onChange={(e) => handleChange('voice_script', e.target.value)}
                  placeholder="Hi {{first_name}}, this is a quick message from {{business_name}}..."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  Keep it under 30 seconds for best results. ~${voiceCost} per drop.
                </p>
              </div>
            )}
          </TabsContent>

          {/* TIMING TAB */}
          <TabsContent value="timing" className="space-y-4 mt-4">
            {isFirstStep ? (
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <RiTimeLine className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      First step sends immediately after enrollment
                    </span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="delay_days">Days to wait</Label>
                  <Select
                    value={String(editedStep.delay_days)}
                    onValueChange={(v) => handleChange('delay_days', parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {i} day{i !== 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delay_hours">Hours to wait</Label>
                  <Select
                    value={String(editedStep.delay_hours)}
                    onValueChange={(v) => handleChange('delay_hours', parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {i} hour{i !== 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </TabsContent>

          {/* VOICE TAB */}
          {step.type === 'voice_drop' && (
            <TabsContent value="voice" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Select Voice</Label>
                <div className="grid grid-cols-2 gap-3">
                  {VOICE_OPTIONS.map((voice) => (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => handleChange('voice_id', voice.id)}
                      className={`p-4 rounded-lg border text-left transition-colors ${
                        editedStep.voice_id === voice.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-muted-foreground/50'
                      }`}
                    >
                      <p className="font-medium">{voice.name}</p>
                      <p className="text-xs text-muted-foreground">{voice.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>
          )}

          {/* PREVIEW TAB */}
          {step.type !== 'voice_drop' && (
            <TabsContent value="preview" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    Preview with sample data:
                  </p>
                  {step.type === 'sms' && (
                    <div className="bg-blue-600 text-white rounded-lg p-4 max-w-xs">
                      <p className="text-sm">
                        {(editedStep.template || '')
                          .replace(/\{\{first_name\}\}/g, 'Sarah')
                          .replace(/\{\{last_name\}\}/g, 'Johnson')
                          .replace(/\{\{business_name\}\}/g, 'Sparkle Cleaning')
                          .replace(/\{\{booking_link\}\}/g, 'https://book.example.com')
                          .replace(/\{\{review_link\}\}/g, 'https://g.page/review')
                          || 'Your message will appear here...'}
                      </p>
                    </div>
                  )}
                  {step.type === 'email' && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted px-4 py-2 border-b">
                        <p className="font-medium text-sm">
                          {(editedStep.email_subject || 'Subject line')
                            .replace(/\{\{first_name\}\}/g, 'Sarah')
                            .replace(/\{\{business_name\}\}/g, 'Sparkle Cleaning')}
                        </p>
                      </div>
                      <div className="p-4">
                        <div className="prose prose-sm max-w-none">
                          {(editedStep.email_body || '')
                            .replace(/\{\{first_name\}\}/g, 'Sarah')
                            .replace(/\{\{last_name\}\}/g, 'Johnson')
                            .replace(/\{\{business_name\}\}/g, 'Sparkle Cleaning')
                            .replace(/\{\{booking_link\}\}/g, 'https://book.example.com')
                            .split('\n')
                            .map((line, i) => (
                              <p key={i} className={line ? '' : 'h-4'}>
                                {line}
                              </p>
                            ))}
                        </div>
                        {editedStep.email_cta_text && (
                          <div className="mt-4">
                            <Button size="sm">{editedStep.email_cta_text}</Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Step</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
