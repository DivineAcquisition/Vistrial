'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Code, ExternalLink, Link as LinkIcon } from 'lucide-react';

export function EmbedCodeGenerator({ bookingUrl, slug, primaryColor }: { bookingUrl: string; slug: string; primaryColor: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, type: string) => { navigator.clipboard.writeText(text); setCopied(type); setTimeout(() => setCopied(null), 2000); };

  const embedUrl = `${bookingUrl}?embed=true`;
  const iframeCode = `<iframe src="${embedUrl}" width="100%" height="800" frameborder="0" style="border:none;border-radius:12px"></iframe>`;
  const buttonCode = `<a href="${bookingUrl}" target="_blank" style="display:inline-block;padding:12px 24px;background:${primaryColor};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-family:system-ui">Book Now</a>`;
  const popupCode = `<button onclick="window.open('${bookingUrl}','Booking','width=500,height=700,left='+(screen.width/2-250)+',top='+(screen.height/2-350))" style="padding:12px 24px;background:${primaryColor};color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:system-ui">Book Now</button>`;
  const reactCode = `<iframe src="${embedUrl}" style={{width:'100%',height:'800px',border:'none'}} title="Book Now" />`;

  const CodeBlock = ({ code, type }: { code: string; type: string }) => (
    <div className="relative"><pre className="p-3 bg-gray-950 text-gray-100 rounded-xl overflow-x-auto text-[11px] leading-relaxed"><code>{code}</code></pre><Button size="sm" variant="secondary" className="absolute top-2 right-2 h-7 text-[10px]" onClick={() => copy(code, type)}>{copied === type ? <><Check className="h-3 w-3 mr-1" />Copied</> : <><Copy className="h-3 w-3 mr-1" />Copy</>}</Button></div>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Direct Link</Label>
        <div className="flex gap-2"><Input value={bookingUrl} readOnly className="font-mono text-xs" /><Button variant="outline" size="sm" onClick={() => copy(bookingUrl, 'link')}>{copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button></div>
      </div>

      <div className="space-y-3"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Embed Code</Label>
        <Tabs defaultValue="iframe">
          <TabsList className="grid w-full grid-cols-4 h-8"><TabsTrigger value="iframe" className="text-[11px]">iFrame</TabsTrigger><TabsTrigger value="button" className="text-[11px]">Button</TabsTrigger><TabsTrigger value="popup" className="text-[11px]">Popup</TabsTrigger><TabsTrigger value="react" className="text-[11px]">React</TabsTrigger></TabsList>
          <TabsContent value="iframe" className="mt-3"><CodeBlock code={iframeCode} type="iframe" /></TabsContent>
          <TabsContent value="button" className="mt-3"><div className="p-4 bg-gray-50 rounded-xl text-center mb-3"><a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-block px-5 py-2.5 text-white rounded-lg font-semibold text-sm" style={{ backgroundColor: primaryColor }}>Book Now</a></div><CodeBlock code={buttonCode} type="button" /></TabsContent>
          <TabsContent value="popup" className="mt-3"><p className="text-xs text-gray-500 mb-3">Opens booking form in a popup window</p><CodeBlock code={popupCode} type="popup" /></TabsContent>
          <TabsContent value="react" className="mt-3"><Badge variant="outline" className="mb-3 text-[10px]">TypeScript compatible</Badge><CodeBlock code={reactCode} type="react" /></TabsContent>
        </Tabs>
      </div>

      <div className="space-y-2"><Label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Campaign Link</Label>
        <div className="p-3 bg-gray-50 rounded-xl"><code className="text-[11px] break-all text-gray-600">{bookingUrl}?campaign={'{{campaign_id}}'}</code></div>
        <p className="text-[11px] text-gray-400">Revenue from this link is attributed to the campaign</p>
      </div>
    </div>
  );
}
