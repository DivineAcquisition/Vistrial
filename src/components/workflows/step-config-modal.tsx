// @ts-nocheck
'use client';

// ============================================
// STEP CONFIGURATION MODAL
// Configure individual workflow step
// ============================================

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Phone, Volume2 } from 'lucide-react';
import type { WorkflowStep } from '@/types/workflows';

interface StepConfigModalProps {
  step: WorkflowStep;
  isFirst: boolean;
  onSave: (step: WorkflowStep) => void;
  onCancel: () => void;
}

const TEMPLATE_VARIABLES = [
  { key: '{{first_name}}', label: 'First Name' },
  { key: '{{last_name}}', label: 'Last Name' },
  { key: '{{business_name}}', label: 'Business Name' },
  { key: '{{business_phone}}', label: 'Business Phone' },
  { key: '{{review_link}}', label: 'Review Link' },
  { key: '{{booking_link}}', label: 'Booking Link' },
];

export function StepConfigModal({
  step,
  isFirst,
  onSave,
  onCancel,
}: StepConfigModalProps) {
  const [formData, setFormData] = useState<WorkflowStep>({ ...step });

  const handleInsertVariable = (variable: string) => {
    setFormData({
      ...formData,
      template: formData.template + variable,
    });
  };

  const handleSave = () => {
    if (!formData.template.trim()) {
      return;
    }
    onSave(formData);
  };

  const characterCount = formData.template.length;
  const smsSegments = Math.ceil(characterCount / 160);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl bg-gray-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {formData.type === 'sms' ? (
              <>
                <MessageSquare className="h-5 w-5 text-blue-400" />
                Configure SMS Message
              </>
            ) : (
              <>
                <Phone className="h-5 w-5 text-purple-400" />
                Configure Voice Drop
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Set up the timing and content for this step
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="content" className="space-y-4">
          <TabsList className="bg-gray-800/50 border border-white/10">
            <TabsTrigger value="content" className="data-[state=active]:bg-violet-600">Content</TabsTrigger>
            <TabsTrigger value="timing" className="data-[state=active]:bg-violet-600">Timing</TabsTrigger>
            {formData.type === 'voice_drop' && (
              <TabsTrigger value="voice" className="data-[state=active]:bg-violet-600">Voice</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="content" className="space-y-4">
            {/* Template Variables */}
            <div className="space-y-2">
              <Label className="text-gray-300">Insert Variable</Label>
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <Badge
                    key={variable.key}
                    variant="outline"
                    className="cursor-pointer border-white/20 text-gray-400 hover:bg-violet-600/20 hover:text-violet-400"
                    onClick={() => handleInsertVariable(variable.key)}
                  >
                    {variable.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Message Content */}
            <div className="space-y-2">
              <Label htmlFor="template" className="text-gray-300">
                {formData.type === 'sms' ? 'Message Text' : 'Voice Script'}
              </Label>
              <Textarea
                id="template"
                value={formData.template}
                onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                placeholder={
                  formData.type === 'sms'
                    ? 'Hi {{first_name}}, this is {{business_name}}...'
                    : 'Hi {{first_name}}, this is {{business_name}} calling...'
                }
                rows={6}
                className="bg-gray-800 border-white/10 text-white"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>{characterCount} characters</span>
                {formData.type === 'sms' && (
                  <span>
                    {smsSegments} SMS segment{smsSegments !== 1 ? 's' : ''} 
                    (≈ ${(smsSegments * 0.015).toFixed(3)})
                  </span>
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label className="text-gray-300">Preview</Label>
              <div className="p-4 bg-gray-800/50 rounded-lg text-sm text-gray-300">
                {formData.template
                  .replace('{{first_name}}', 'John')
                  .replace('{{last_name}}', 'Smith')
                  .replace('{{business_name}}', 'Acme Cleaning')
                  .replace('{{business_phone}}', '(555) 123-4567')
                  .replace('{{review_link}}', 'https://g.page/review')
                  .replace('{{booking_link}}', 'https://book.acme.com')}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="timing" className="space-y-4">
            {isFirst ? (
              <div className="p-4 bg-gray-800/50 rounded-lg text-sm text-gray-400">
                This is the first step. It will be sent immediately when a contact is enrolled.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-gray-300">Wait Before Sending</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="delay_days" className="text-sm text-gray-500">
                        Days
                      </Label>
                      <Input
                        id="delay_days"
                        type="number"
                        min="0"
                        max="90"
                        value={formData.delay_days}
                        onChange={(e) =>
                          setFormData({ ...formData, delay_days: parseInt(e.target.value) || 0 })
                        }
                        className="bg-gray-800 border-white/10 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="delay_hours" className="text-sm text-gray-500">
                        Hours
                      </Label>
                      <Input
                        id="delay_hours"
                        type="number"
                        min="0"
                        max="23"
                        value={formData.delay_hours}
                        onChange={(e) =>
                          setFormData({ ...formData, delay_hours: parseInt(e.target.value) || 0 })
                        }
                        className="bg-gray-800 border-white/10 text-white"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    This step will be sent {formData.delay_days} day{formData.delay_days !== 1 ? 's' : ''}
                    {formData.delay_hours > 0 && ` and ${formData.delay_hours} hour${formData.delay_hours !== 1 ? 's' : ''}`} after the previous step.
                  </p>
                </div>
              </>
            )}
          </TabsContent>

          {formData.type === 'voice_drop' && (
            <TabsContent value="voice" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="voice_id" className="text-gray-300">Voice</Label>
                <Select
                  value={formData.voice_id || 'default'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, voice_id: value === 'default' ? undefined : value })
                  }
                >
                  <SelectTrigger className="bg-gray-800 border-white/10 text-white">
                    <SelectValue placeholder="Select a voice" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-white/10">
                    <SelectItem value="default">Rachel (Default)</SelectItem>
                    <SelectItem value="EXAVITQu4vr4xnSDxMaL">Bella (Warm)</SelectItem>
                    <SelectItem value="ErXwobaYiN019PkySvjV">Antoni (Professional)</SelectItem>
                    <SelectItem value="pNInz6obpgDQGcFmaJgB">Adam (Deep)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                className="border-white/10 text-white hover:bg-gray-800"
                disabled={!formData.template.trim()}
              >
                <Volume2 className="h-4 w-4 mr-2" />
                Preview Voice
              </Button>

              <p className="text-xs text-gray-500">
                Voice drops cost approximately $0.05 each and are delivered as ringless voicemails.
              </p>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} className="border-white/10 text-white hover:bg-gray-800">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!formData.template.trim()} className="bg-violet-600 hover:bg-violet-700">
            Save Step
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
