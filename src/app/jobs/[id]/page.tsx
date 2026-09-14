'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface PrimaryResultData {
  documentType?: string;
  originalFilename?: string;
  extractedTopics?: string[];
  structuredNotes?: Array<{
    section: string;
    content: string;
  }>;
  confidenceScore?: number;
  processedAt?: string;
  rawTranscription?: string;
}

interface FollowupResultData {
  action?: string;
  summaryTitle?: string;
  keyPoints?: string[];
  wordCount?: number;
  generatedAt?: string;
}

interface JobDetails {
  id: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  attempts: number;
  errorMessage: string | null;
  jobType: string;
  parentJobId: string | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  resultData: PrimaryResultData | FollowupResultData | any;
  rawOutput: string | null;
  createdAt: string;
  updatedAt: string;
  followupJobs: Array<{
    id: string;
    status: string;
    jobType: string;
    createdAt: string;
  }>;
}

export default function JobStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = use(params);
  const [job, setJob] = useState<JobDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [triggeringFollowup, setTriggeringFollowup] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  // Poll job status while pending or processing
  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout;

    const fetchJobStatus = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch job details (${res.status})`);
        }
        const data: JobDetails = await res.json();
        if (isMounted) {
          setJob(data);
          setError(null);

          // Stop polling once job reaches terminal state (done or failed)
          if (data.status === 'done' || data.status === 'failed') {
            clearInterval(intervalId);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Error loading job details');
        }
      }
    };

    fetchJobStatus();
    intervalId = setInterval(fetchJobStatus, 1500);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [jobId]);

  const handleFollowup = async () => {
    setTriggeringFollowup(true);
    setFollowupError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/followup`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to trigger follow-up action');
      }

      // Navigate to the newly created follow-up job page
      window.location.href = `/jobs/${data.followupJobId}`;
    } catch (err: any) {
      setFollowupError(err?.message || 'Follow-up request failed');
      setTriggeringFollowup(false);
    }
  };

  if (error) {
    return (
      <div style={{ maxWidth: '800px', margin: '3rem auto', padding: '2rem', textAlign: 'center' }}>
        <div
          style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontWeight: 500,
          }}
        >
          {error}
        </div>
        <Link href="/upload" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
          ← Back to Upload Page
        </Link>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ maxWidth: '800px', margin: '4rem auto', textAlign: 'center', color: '#4b5563' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 500 }}>Retrieving Job Status...</div>
        <div style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: '#9ca3af' }}>Polling PostgreSQL job database...</div>
      </div>
    );
  }

  const primaryResult = job.jobType !== 'followup' ? (job.resultData as PrimaryResultData) : null;
  const followupResult = job.jobType === 'followup' ? (job.resultData as FollowupResultData) : null;

  return (
    <div style={{ maxWidth: '840px', margin: '2rem auto', padding: '0 1rem' }}>
      {/* Top Navigation */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link
          href="/upload"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: '#3b82f6',
            fontSize: '0.9rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ← Upload Another Note / Document
        </Link>
        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
          Updated: {new Date(job.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      {/* Main Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
          overflow: 'hidden',
        }}
      >
        {/* Header Banner */}
        <div
          style={{
            padding: '1.75rem 2rem',
            borderBottom: '1px solid #f3f4f6',
            backgroundColor: '#fafafa',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  backgroundColor: job.jobType === 'followup' ? '#f3e8ff' : '#dbeafe',
                  color: job.jobType === 'followup' ? '#6b21a8' : '#1e40af',
                }}
              >
                {job.jobType === 'followup' ? 'Follow-Up Action (DeepSeek)' : 'AI Processing (Gemini + DeepSeek)'}
              </span>
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              {job.originalFilename}
            </h1>
          </div>

          {/* Status Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 1rem',
              borderRadius: '9999px',
              fontWeight: 700,
              fontSize: '0.85rem',
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              backgroundColor:
                job.status === 'done'
                  ? '#dcfce7'
                  : job.status === 'failed'
                  ? '#fee2e2'
                  : '#e0f2fe',
              color:
                job.status === 'done'
                  ? '#166534'
                  : job.status === 'failed'
                  ? '#991b1b'
                  : '#075985',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor:
                  job.status === 'done'
                    ? '#22c55e'
                    : job.status === 'failed'
                    ? '#ef4444'
                    : '#0ea5e9',
              }}
            />
            {job.status}
          </div>
        </div>

        {/* Card Body */}
        <div style={{ padding: '2rem' }}>
          {/* Status: Pending or Processing */}
          {(job.status === 'pending' || job.status === 'processing') && (
            <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  margin: '0 auto 1.25rem',
                  border: '3px solid #e0f2fe',
                  borderTopColor: '#0284c7',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#0369a1', margin: '0 0 0.5rem' }}>
                {job.status === 'pending' ? 'Queued in Concurrency Cap Queue...' : 'AI Models Analyzing Note...'}
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: '450px', margin: '0 auto' }}>
                Role 1 (Gemini) extracts handwritten contents, followed by Role 2 (DeepSeek) structuring into JSON schemas.
              </p>
            </div>
          )}

          {/* Status: Failed */}
          {job.status === 'failed' && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                borderRadius: '12px',
                padding: '1.5rem',
                border: '1px solid #fecaca',
              }}
            >
              <h3 style={{ color: '#991b1b', margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 600 }}>
                Processing Unsuccessful
              </h3>
              <p style={{ color: '#7f1d1d', fontSize: '0.95rem', margin: 0 }}>
                {job.errorMessage || 'An error occurred while running model inference.'}
              </p>
            </div>
          )}

          {/* Status: Done (Primary Analysis Result View) */}
          {job.status === 'done' && primaryResult && (
            <div>
              {/* Note Metadata Strip */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                {primaryResult.documentType && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', backgroundColor: '#f3f4f6', padding: '0.3rem 0.8rem', borderRadius: '6px' }}>
                    📄 {primaryResult.documentType}
                  </span>
                )}
                {typeof primaryResult.confidenceScore === 'number' && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#047857', backgroundColor: '#ecfdf5', padding: '0.3rem 0.8rem', borderRadius: '6px' }}>
                    ✨ Math / OCR Confidence: {Math.round(primaryResult.confidenceScore * 100)}%
                  </span>
                )}
              </div>

              {/* Extracted Topics */}
              {primaryResult.extractedTopics && primaryResult.extractedTopics.length > 0 && (
                <div style={{ marginBottom: '1.75rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                    Extracted Note Topics
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {primaryResult.extractedTopics.map((topic, idx) => (
                      <span
                        key={idx}
                        style={{
                          backgroundColor: '#eff6ff',
                          color: '#1d4ed8',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          padding: '0.35rem 0.85rem',
                          borderRadius: '20px',
                          border: '1px solid #bfdbfe',
                        }}
                      >
                        #{topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Structured Note Cards */}
              {primaryResult.structuredNotes && primaryResult.structuredNotes.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
                    Structured Note Sections
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {primaryResult.structuredNotes.map((note, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '10px',
                          padding: '1.25rem 1.5rem',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                        }}
                      >
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 600, color: '#1f2937' }}>
                          {note.section}
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.95rem', color: '#4b5563', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                          {note.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw OCR Transcription Accordion (Optional) */}
              {primaryResult.rawTranscription && (
                <details style={{ marginBottom: '2rem', backgroundColor: '#f9fafb', padding: '0.85rem 1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#4b5563', fontSize: '0.9rem' }}>
                    View Raw Gemini Handwriting OCR Output
                  </summary>
                  <pre style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                    {primaryResult.rawTranscription}
                  </pre>
                </details>
              )}

              {/* Follow-Up Action Box */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
                      Follow-Up Action: Executive Summarizer
                    </h3>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                      Triggers DeepSeek (Role 2) to synthesize an executive summary and action items.
                    </p>
                  </div>
                  <button
                    onClick={handleFollowup}
                    disabled={triggeringFollowup}
                    style={{
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0.65rem 1.25rem',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: triggeringFollowup ? 'not-allowed' : 'pointer',
                      opacity: triggeringFollowup ? 0.7 : 1,
                      boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
                    }}
                  >
                    {triggeringFollowup ? 'Generating Summary...' : '⚡ Summarise Note'}
                  </button>
                </div>

                {followupError && (
                  <div style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                    {followupError}
                  </div>
                )}

                {job.followupJobs && job.followupJobs.length > 0 && (
                  <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '0.4rem' }}>
                      Linked Follow-Up Summaries:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {job.followupJobs.map((f) => (
                        <Link
                          key={f.id}
                          href={`/jobs/${f.id}`}
                          style={{
                            fontSize: '0.875rem',
                            color: '#2563eb',
                            textDecoration: 'none',
                            fontWeight: 500,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                          }}
                        >
                          📌 Executive Summary ({f.status}) →
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status: Done (Follow-up Result View) */}
          {job.status === 'done' && followupResult && (
            <div>
              <div
                style={{
                  backgroundColor: '#faf5ff',
                  border: '1px solid #e9d5ff',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#581c87', margin: 0 }}>
                    {followupResult.summaryTitle || 'Executive Summary'}
                  </h2>
                  {typeof followupResult.wordCount === 'number' && (
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7e22ce', backgroundColor: '#f3e8ff', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                      {followupResult.wordCount} words
                    </span>
                  )}
                </div>

                {followupResult.keyPoints && followupResult.keyPoints.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {followupResult.keyPoints.map((point, idx) => (
                      <li key={idx} style={{ fontSize: '0.975rem', color: '#3b0764', lineHeight: '1.5' }}>
                        {point}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {job.parentJobId && (
                <Link
                  href={`/jobs/${job.parentJobId}`}
                  style={{ fontSize: '0.9rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                >
                  ← Back to Original Extracted Note
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Technical Audit & Proof Section (Collapsible Accordion) */}
        <div style={{ borderTop: '1px solid #f3f4f6', backgroundColor: '#f9fafb', padding: '1rem 2rem' }}>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>
              🔍 Technical Audit & Database Verification (Proof Logs)
            </summary>
            <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div><strong>Job ID (DB Row):</strong> {job.id}</div>
              <div><strong>Storage Key (Object Storage):</strong> {job.storageKey}</div>
              <div><strong>Attempts Count:</strong> {job.attempts}</div>
              <div><strong>Created Timestamp:</strong> {new Date(job.createdAt).toLocaleString()}</div>

              <div style={{ marginTop: '0.5rem' }}>
                <button
                  onClick={() => setShowRawJson(!showRawJson)}
                  style={{
                    backgroundColor: '#e5e7eb',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: '#374151',
                  }}
                >
                  {showRawJson ? 'Hide Raw JSON Response' : 'Show Raw JSON Response (Grading Proof)'}
                </button>
              </div>

              {showRawJson && (
                <pre
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    padding: '1rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    overflowX: 'auto',
                    marginTop: '0.5rem',
                  }}
                >
                  {job.rawOutput || JSON.stringify(job.resultData, null, 2)}
                </pre>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
