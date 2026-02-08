'use client';

// ============================================
// EMBED CODE GENERATOR
// Generate embed codes for booking pages with
// multiple formats and configuration options
// ============================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Copy,
  Check,
  Code,
  ExternalLink,
  Link as LinkIcon,
} from 'lucide-react';

interface EmbedCodeGeneratorProps {
  bookingUrl: string;
  slug: string;
  primaryColor: string;
}

export function EmbedCodeGenerator({
  bookingUrl,
  slug,
  primaryColor,
}: EmbedCodeGeneratorProps) {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [embedHeight, setEmbedHeight] = useState(800);
  const [showBorder, setShowBorder] = useState(false);
  const [responsiveEmbed, setResponsiveEmbed] = useState(true);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const embedUrl = `${bookingUrl}?embed=true`;

  const iframeCode = responsiveEmbed
    ? `<div style="position: relative; width: 100%; max-width: 600px; margin: 0 auto;">
  <iframe
    src="${embedUrl}"
    style="width: 100%; height: ${embedHeight}px; border: none;${showBorder ? ' border: 1px solid #e5e7eb; border-radius: 12px;' : ''}"
  ></iframe>
</div>`
    : `<iframe
  src="${embedUrl}"
  width="100%"
  height="${embedHeight}"
  frameborder="0"
  ${showBorder ? 'style="border: 1px solid #e5e7eb; border-radius: 12px;"' : 'style="border: none;"'}
></iframe>`;

  const buttonCode = `<a
  href="${bookingUrl}"
  target="_blank"
  style="display: inline-block; padding: 12px 24px; background-color: ${primaryColor}; color: white; text-decoration: none; border-radius: 8px; font-family: system-ui; font-weight: 600;"
>
  Book Now
</a>`;

  const popupCode = `<button
  onclick="window.open('${bookingUrl}','Booking','width=500,height=700,left='+(screen.width/2-250)+',top='+(screen.height/2-350))"
  style="padding: 12px 24px; background-color: ${primaryColor}; color: white; border: none; border-radius: 8px; font-family: system-ui; font-weight: 600; cursor: pointer;"
>
  Book Now
</button>`;

  const reactCode = `// React/Next.js Component
function BookingEmbed() {
  return (
    <iframe
      src="${embedUrl}"
      style={{
        width: '100%',
        height: '${embedHeight}px',
        border: 'none',
      }}
      title="Book Now"
    />
  );
}`;

  const wordpressShortcode = `[iframe src="${embedUrl}" width="100%" height="${embedHeight}"]`;

  const CodeBlock = ({
    code,
    type,
  }: {
    code: string;
    type: string;
  }) => (
    <div className="relative">
      <pre className="p-3 bg-gray-950 text-gray-100 rounded-xl overflow-x-auto text-[11px] leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        size="sm"
        variant="secondary"
        className="absolute top-2 right-2 h-7 text-[10px]"
        onClick={() => copyToClipboard(code, type)}
      >
        {copiedType === type ? (
          <>
            <Check className="h-3 w-3 mr-1" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </>
        )}
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Direct Link */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Direct Link
        </Label>
        <div className="flex gap-2">
          <Input value={bookingUrl} readOnly className="font-mono text-xs" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(bookingUrl, 'link')}
          >
            {copiedType === 'link' ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
        </div>
      </div>

      {/* Embed Code Options */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Embed Code
        </Label>

        <Tabs defaultValue="iframe">
          <TabsList className="grid w-full grid-cols-4 h-8">
            <TabsTrigger value="iframe" className="text-[11px]">
              iFrame
            </TabsTrigger>
            <TabsTrigger value="button" className="text-[11px]">
              Button
            </TabsTrigger>
            <TabsTrigger value="popup" className="text-[11px]">
              Popup
            </TabsTrigger>
            <TabsTrigger value="react" className="text-[11px]">
              React
            </TabsTrigger>
          </TabsList>

          {/* iFrame */}
          <TabsContent value="iframe" className="mt-3 space-y-3">
            <div className="space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Responsive Width</p>
                  <p className="text-[10px] text-gray-400">
                    Auto-fit container
                  </p>
                </div>
                <Switch
                  checked={responsiveEmbed}
                  onCheckedChange={setResponsiveEmbed}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Height</Label>
                  <span className="text-[10px] text-gray-400">
                    {embedHeight}px
                  </span>
                </div>
                <Slider
                  value={[embedHeight]}
                  onValueChange={([v]) => setEmbedHeight(v)}
                  min={400}
                  max={1200}
                  step={50}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Show Border</p>
                  <p className="text-[10px] text-gray-400">
                    Add border around embed
                  </p>
                </div>
                <Switch
                  checked={showBorder}
                  onCheckedChange={setShowBorder}
                />
              </div>
            </div>

            <CodeBlock code={iframeCode} type="iframe" />
          </TabsContent>

          {/* Button */}
          <TabsContent value="button" className="mt-3 space-y-3">
            <div className="p-4 bg-gray-50 rounded-xl text-center border border-gray-100">
              <p className="text-[10px] text-gray-400 mb-3">Preview:</p>
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-5 py-2.5 text-white rounded-lg font-semibold text-sm"
                style={{ backgroundColor: primaryColor }}
              >
                Book Now
              </a>
            </div>
            <CodeBlock code={buttonCode} type="button" />
          </TabsContent>

          {/* Popup */}
          <TabsContent value="popup" className="mt-3 space-y-3">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">
                Opens booking form in a popup window.
              </p>
              <Badge variant="outline" className="text-[10px]">
                Best for: CTAs, navigation menus
              </Badge>
            </div>
            <CodeBlock code={popupCode} type="popup" />
          </TabsContent>

          {/* React */}
          <TabsContent value="react" className="mt-3 space-y-3">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <Badge variant="outline" className="text-[10px]">
                TypeScript compatible
              </Badge>
            </div>
            <CodeBlock code={reactCode} type="react" />
          </TabsContent>
        </Tabs>
      </div>

      {/* Campaign Attribution */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Campaign Link
        </Label>
        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
          <code className="text-[11px] break-all text-gray-600">
            {bookingUrl}?campaign={'{{campaign_id}}'}&workflow=
            {'{{workflow_id}}'}
          </code>
        </div>
        <p className="text-[11px] text-gray-400">
          Revenue from bookings through this link is attributed to the campaign
        </p>
      </div>

      {/* WordPress */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            WordPress
          </Label>
          <Badge variant="secondary" className="text-[9px]">
            Plugin Required
          </Badge>
        </div>
        <CodeBlock code={wordpressShortcode} type="wordpress" />
      </div>
    </div>
  );
}
