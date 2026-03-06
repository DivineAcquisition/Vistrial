'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Upload, MoreVertical, Pencil, Trash2, FileText, Sparkles, Building2 } from 'lucide-react';
import { PricingUploadModal } from './pricing-upload-modal';
import { useToast } from '@/hooks/use-toast';

interface PricingMatrixListProps { pricingMatrices: any[]; organizationId: string; }

export function PricingMatrixList({ pricingMatrices, organizationId }: PricingMatrixListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this pricing matrix?')) return;
    setIsDeleting(id);
    try {
      const res = await fetch(`/api/booking/pricing-matrix/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Pricing matrix deleted' });
      router.refresh();
    } catch { toast({ title: 'Delete failed', variant: 'destructive' }); }
    finally { setIsDeleting(null); }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>Pricing Matrices</CardTitle><CardDescription>Your service pricing configurations</CardDescription></div>
            <Button onClick={() => setShowUploadModal(true)} variant="gradient"><Upload className="h-4 w-4 mr-2" />Upload Pricing Sheet</Button>
          </div>
        </CardHeader>
        <CardContent>
          {pricingMatrices.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4"><Sparkles className="h-7 w-7 text-brand-600" /></div>
              <h3 className="font-semibold text-lg mb-2">AI-Powered Pricing Setup</h3>
              <p className="text-gray-500 max-w-md mx-auto mb-6 text-sm">Upload your existing pricing sheet (PDF, image, or document) and our AI will automatically extract your services, options, and pricing into a dynamic matrix.</p>
              <Button onClick={() => setShowUploadModal(true)} variant="gradient"><Upload className="h-4 w-4 mr-2" />Upload Your Pricing Sheet</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {pricingMatrices.map((matrix) => (
                <div key={matrix.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200/80 hover:border-gray-300 hover:shadow-soft transition-all duration-200">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center"><FileText className="h-5 w-5 text-brand-600" /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{matrix.name}</p>
                        {matrix.source_document && <Badge variant="gradient" className="text-[10px]"><Sparkles className="h-3 w-3 mr-1" />AI Generated</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {matrix.business_type && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{matrix.business_type}</span>}
                        <span>{matrix.services?.length || 0} services</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/booking/pricing/${matrix.id}`}><Button variant="outline" size="sm"><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button></Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end"><DropdownMenuItem className="text-red-600" onClick={() => handleDelete(matrix.id)} disabled={isDeleting === matrix.id}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem></DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <PricingUploadModal open={showUploadModal} onClose={() => setShowUploadModal(false)} onSuccess={() => { setShowUploadModal(false); router.refresh(); }} />
    </>
  );
}
