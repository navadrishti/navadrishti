import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, FileText } from 'lucide-react';
import { documentLabels } from './helpers';
import type { DocumentKey } from './types';

interface DocumentsStepProps {
  documentKeys: DocumentKey[];
  documentFiles: Record<DocumentKey, File | null>;
  uploadedUrls: Record<DocumentKey, string>;
  loading: boolean;
  reverifyMode: boolean;
  onFileChange: (key: DocumentKey, fileList: FileList | null) => void;
  onBack: () => void;
  onSubmit: () => void;
  onCancelReverify: () => void;
}

export function DocumentsStep({
  documentKeys,
  documentFiles,
  uploadedUrls,
  loading,
  reverifyMode,
  onFileChange,
  onBack,
  onSubmit,
  onCancelReverify
}: DocumentsStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Upload Documents
        </CardTitle>
        <CardDescription>
          Upload required documents based on your verification type. A bank statement for the last 6 months is required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {documentKeys.map((docKey) => (
          <div key={docKey} className="space-y-2">
            <Label htmlFor={docKey}>
              {documentLabels[docKey]}
              {' *'}
            </Label>
            <Input
              id={docKey}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="h-auto cursor-pointer border border-gray-200 bg-gray-50/80 py-2.5 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-udaan-orange file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-udaan-orange/90"
              onChange={(e) => onFileChange(docKey, e.target.files)}
            />
            {documentFiles[docKey] && (
              <p className="text-sm text-gray-600 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {documentFiles[docKey]?.name}
              </p>
            )}
            {!!uploadedUrls[docKey] && (
              <p className="text-xs text-green-600">Uploaded successfully</p>
            )}
          </div>
        ))}

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onBack} disabled={loading} className="hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={onSubmit} disabled={loading}>
            {loading ? 'Submitting...' : reverifyMode ? 'Submit reverification' : 'Submit Verification'}
          </Button>
          {reverifyMode && (
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={onCancelReverify}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
