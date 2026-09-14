'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
      setError(null);
    }
  };

  const removeFile = (indexToRemove: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Please select at least one file to upload.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to upload files');
      }

      // Fast response return -> immediate redirect to job status screen for the single unified job
      router.push(`/jobs/${data.jobId}`);
    } catch (err: any) {
      setError(err?.message || 'An error occurred during upload.');
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--color-role-surface-container-high, #f0f4fa)',
        borderRadius: '12px',
        padding: '2.5rem',
        border: '1px solid var(--color-role-outline-variant, #c3c7d0)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
      }}
    >
      <h1
        style={{
          fontSize: '1.75rem',
          fontWeight: 600,
          marginBottom: '0.5rem',
          color: 'var(--color-role-on-surface, #191c20)',
        }}
      >
        Upload Documents or Handwritten Notes
      </h1>
      <p
        style={{
          color: 'var(--color-role-tertiary-key-color, #435b7d)',
          marginBottom: '2rem',
          fontSize: '0.95rem',
        }}
      >
        Select one or multiple files to process asynchronously into a single, unified AI-structured document.
      </p>

      {error && (
        <div
          style={{
            backgroundColor: '#ff4d4d',
            color: '#ffffff',
            padding: '0.85rem 1.25rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div
          style={{
            border: '2px dashed var(--color-role-outline, #73777f)',
            borderRadius: '8px',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            backgroundColor: 'var(--color-role-surface, #ffffff)',
            marginBottom: '1.5rem',
            cursor: 'pointer',
          }}
        >
          <input
            type="file"
            id="fileInput"
            onChange={handleFileChange}
            accept=".pdf,.png,.jpg,.jpeg,.txt,.md"
            multiple
            style={{ display: 'none' }}
          />
          <label htmlFor="fileInput" style={{ cursor: 'pointer', display: 'block' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '0.5rem' }}>
              Click or Drag to Select File(s)
            </div>
            <div
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-role-tertiary-key-color, #435b7d)',
              }}
            >
              Supported types: PDF, PNG, JPG, TXT, MD (Max 10MB per file). Select 1 or multiple files.
            </div>
          </label>
        </div>

        {files.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Selected Files ({files.length}):
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {files.map((file, idx) => (
                <li
                  key={`${file.name}-${idx}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.85rem',
                    backgroundColor: '#ffffff',
                    borderRadius: '6px',
                    marginBottom: '0.4rem',
                    border: '1px solid var(--color-role-outline-variant, #c3c7d0)',
                    fontSize: '0.9rem',
                  }}
                >
                  <span>
                    <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#d32f2f',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Remove ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="submit"
          disabled={files.length === 0 || uploading}
          style={{
            width: '100%',
            backgroundColor: 'var(--color-role-primary-key-color, #2071e3)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '0.85rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 600,
            opacity: files.length === 0 || uploading ? 0.6 : 1,
            cursor: files.length === 0 || uploading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          {uploading
            ? `Accepting Upload (${files.length} file${files.length > 1 ? 's' : ''})...`
            : `Submit & Start Job (${files.length > 0 ? files.length : 0} file${files.length !== 1 ? 's' : ''})`}
        </button>
      </form>
    </div>
  );
}
