'use client';

// ============================================
// TEMPLATE PICKER
// Select a pre-built workflow template
// ============================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RiMessage2Line,
  RiMailLine,
  RiPhoneLine,
  RiArrowRightLine,
  RiSparklingLine,
  RiStarLine,
  RiCalendarLine,
  RiHeartLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils/cn';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '@/lib/workflows/templates';

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: WorkflowTemplate) => void;
}

const CATEGORY_INFO = {
  reactivation: { icon: RiHeartLine, label: 'Reactivation', color: 'text-pink-600' },
  review: { icon: RiStarLine, label: 'Review Request', color: 'text-yellow-600' },
  seasonal: { icon: RiCalendarLine, label: 'Seasonal', color: 'text-blue-600' },
  winback: { icon: RiSparklingLine, label: 'Win-Back', color: 'text-purple-600' },
};

export function TemplatePicker({ open, onClose, onSelect }: TemplatePickerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');

  const filteredTemplates = activeTab === 'all'
    ? WORKFLOW_TEMPLATES
    : WORKFLOW_TEMPLATES.filter((t) => t.category === activeTab);

  const handleSelect = () => {
    if (selectedTemplate) {
      onSelect(selectedTemplate);
      onClose();
    }
  };

  const getChannelIcons = (channels: WorkflowTemplate['channels']) => {
    return channels.map((channel) => {
      switch (channel) {
        case 'sms':
          return <RiMessage2Line key={channel} className="h-4 w-4 text-blue-600" />;
        case 'email':
          return <RiMailLine key={channel} className="h-4 w-4 text-purple-600" />;
        case 'voice_drop':
          return <RiPhoneLine key={channel} className="h-4 w-4 text-green-600" />;
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose a Template</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="reactivation">Reactivation</TabsTrigger>
            <TabsTrigger value="review">Reviews</TabsTrigger>
            <TabsTrigger value="seasonal">Seasonal</TabsTrigger>
            <TabsTrigger value="winback">Win-Back</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="flex-1 overflow-y-auto mt-4">
            <div className="grid gap-3">
              {filteredTemplates.map((template) => {
                const CategoryIcon = CATEGORY_INFO[template.category].icon;
                const isSelected = selectedTemplate?.id === template.id;

                return (
                  <Card
                    key={template.id}
                    className={cn(
                      'cursor-pointer transition-all hover:border-primary/50',
                      isSelected && 'border-primary border-2 bg-primary/5'
                    )}
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={cn('p-2 rounded-lg bg-muted', CATEGORY_INFO[template.category].color)}>
                          <CategoryIcon className="h-5 w-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{template.name}</h3>
                            <div className="flex items-center gap-1">
                              {getChannelIcons(template.channels)}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {template.description}
                          </p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {template.steps.length} steps
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {Math.ceil(
                                template.steps.reduce((acc, s, i) => (i === 0 ? 0 : acc + s.delay_days), 0)
                              )} days
                            </Badge>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <RiArrowRightLine className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Start from Scratch
          </Button>
          <Button onClick={handleSelect} disabled={!selectedTemplate}>
            Use Template
            <RiArrowRightLine className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
