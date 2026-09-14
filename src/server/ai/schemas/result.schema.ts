/**
 * Structured Output Schemas & Validation Logic
 * 
 * Rules from structured-output-validation-and-retry/SKILL.md:
 * - Schema defined in application code.
 * - Application-level validation on receipt.
 * - Retry logic and graceful fallbacks for validation failure.
 */

export interface PrimaryAnalysisResult {
  documentType: string;
  originalFilename: string;
  extractedTopics: string[];
  structuredNotes: Array<{
    section: string;
    content: string;
  }>;
  confidenceScore: number;
  processedAt: string;
  rawTranscription?: string;
}

export interface FollowupSummaryResult {
  action: string;
  summaryTitle: string;
  keyPoints: string[];
  wordCount: number;
  generatedAt: string;
}

export function validatePrimaryResult(data: unknown): data is PrimaryAnalysisResult {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  
  if (typeof obj.documentType !== 'string' || typeof obj.originalFilename !== 'string') {
    return false;
  }
  if (!Array.isArray(obj.extractedTopics) || !obj.extractedTopics.every((t) => typeof t === 'string')) {
    return false;
  }
  if (!Array.isArray(obj.structuredNotes)) {
    return false;
  }
  for (const item of obj.structuredNotes) {
    if (typeof item !== 'object' || item === null) return false;
    const noteObj = item as Record<string, unknown>;
    if (typeof noteObj.section !== 'string' || typeof noteObj.content !== 'string') {
      return false;
    }
  }
  if (typeof obj.confidenceScore !== 'number') {
    return false;
  }
  return true;
}

export function validateFollowupResult(data: unknown): data is FollowupSummaryResult {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.action === 'string' &&
    typeof obj.summaryTitle === 'string' &&
    Array.isArray(obj.keyPoints) &&
    obj.keyPoints.every((kp) => typeof kp === 'string') &&
    typeof obj.wordCount === 'number'
  );
}
