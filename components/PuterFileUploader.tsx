"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

declare global {
  interface Window {
    Puter: any;
  }
}

export default function PuterFileUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Initialize Puter.js
      const puter = window.Puter;
      if (!puter) {
        throw new Error('Puter.js not loaded');
      }

      // Upload file to Puter
      const result = await puter.files.upload(file, {
        parent_id: null, // Upload to root directory
        name: file.name,
      });

      setFileUrl(result.url);
      toast.success('File uploaded successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <input
          type="file"
          id="puter-upload"
          className="hidden"
          onChange={handleFileUpload}
          disabled={isUploading}
        />
        <label htmlFor="puter-upload">
          <Button asChild variant="outline" disabled={isUploading}>
            <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
          </Button>
        </label>
      </div>
      {fileUrl && (
        <div>
          <p className="text-sm text-muted-foreground">File URL:</p>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {fileUrl}
          </a>
        </div>
      )}
    </div>
  );
}