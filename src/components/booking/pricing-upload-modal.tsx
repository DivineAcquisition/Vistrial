'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Image, File, Loader2, CheckCircle, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useToast } from '@/hooks/use-toast';

interface Props { open: boolean; onClose: () => void; onSuccess: () => void; }
type Status = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export function PricingUploadModal({ open, onClose, onSuccess }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) { setFile(accepted[0]); setError(null); if (!name) setName(accepted[0].name.replace(/\.[^/.]+$/, '')); }
  }, [name]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'], 'application/pdf': ['.pdf'], 'text/plain': ['.txt'] },
    maxSize: 10 * 1024 * 1024, multiple: false, disabled: status === 'uploading' || status === 'processing',
  });

  const handleUpload = async () => {
    if (!file || !name.trim()) return;
    setStatus('uploading'); setError(null);
    try {
      const formData = new FormData(); formData.append('file', file); formData.append('name', name.trim());
      setStatus('processing');
      const res = await fetch('/api/booking/pricing-matrix/extract', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract pricing');
      setExtractedData(data.pricingMatrix); setStatus('success');
      toast({ title: 'Pricing extracted!', description: `Found ${data.pricingMatrix.services?.length || 0} services` });
      setTimeout(() => { router.push(`/booking/pricing/${data.pricingMatrix.id}`); onSuccess(); }, 1500);
    } catch (err) {
      setStatus('error'); setError(err instanceof Error ? err.message : 'Upload failed');
      toast({ title: 'Extraction failed', variant: 'destructive' });
    }
  };

  const handleClose = () => { setFile(null); setName(''); setStatus('idle'); setError(null); setExtractedData(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-brand-600" />AI Pricing Extraction</DialogTitle>
          <DialogDescription>Upload your pricing sheet and we&apos;ll automatically extract your services and pricing</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Pricing Matrix Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Standard Cleaning Prices" disabled={status === 'processing'} /></div>
          <div {...getRootProps()} className={cn('border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all', isDragActive ? 'border-brand-500 bg-brand-50' : file ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-brand-400', (status === 'processing') && 'opacity-50 cursor-not-allowed')}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center">
              <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center mb-3', file ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400')}>
                {status === 'processing' ? <Loader2 className="h-7 w-7 animate-spin text-brand-600" /> : status === 'success' ? <CheckCircle className="h-7 w-7 text-emerald-600" /> : file ? <FileText className="h-7 w-7" /> : <Upload className="h-7 w-7" />}
              </div>
              {status === 'processing' ? <><p className="font-medium">AI is analyzing your pricing...</p><p className="text-sm text-gray-500 mt-1">This usually takes 10-30 seconds</p></> : status === 'success' ? <><p className="font-medium text-emerald-600">Pricing extracted!</p><p className="text-sm text-gray-500 mt-1">Found {extractedData?.services?.length || 0} services</p></> : file ? <><p className="font-medium text-sm">{file.name}</p><p className="text-xs text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p></> : <><p className="font-medium text-sm">{isDragActive ? 'Drop here' : 'Drop your pricing sheet here'}</p><p className="text-xs text-gray-400 mt-1">or click to browse</p></>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-center">{['PDF', 'PNG', 'JPG', 'TXT'].map(f => <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>)}</div>
          {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm"><AlertCircle className="h-4 w-4 shrink-0" /><p>{error}</p></div>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!file || !name.trim() || status === 'processing' || status === 'success'} variant="gradient">
            {status === 'processing' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extracting...</> : <><Sparkles className="h-4 w-4 mr-2" />Extract Pricing</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
