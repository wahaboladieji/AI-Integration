import { z } from 'zod';

/**
 * Structured Output Schemas & Validation Logic using Zod
 * 
 * Rules from structured-output-validation-and-retry/SKILL.md:
 * - Schema defined in application code using Zod.
 * - Application-level validation on receipt using Zod safeParse.
 * - Retry logic and graceful fallbacks for validation failure.
 */

// 1. Zod Schema for Primary Analysis Result (Role 1 Gemini OCR -> Role 2 DeepSeek Structuring)
export const PrimaryAnalysisResultSchema = z.object({
  documentType: z.string(),
  originalFilename: z.string(),
  extractedTopics: z.array(z.string()),
  structuredNotes: z.array(
    z.object({
      section: z.string(),
      content: z.string(),
    })
  ),
  confidenceScore: z.number(),
  processedAt: z.string().optional(),
  rawTranscription: z.string().optional(),
});

export type PrimaryAnalysisResult = z.infer<typeof PrimaryAnalysisResultSchema>;

// 2. Zod Schema for Follow-up Action Executive Summary
export const FollowupSummaryResultSchema = z.object({
  action: z.string(),
  summaryTitle: z.string(),
  keyPoints: z.array(z.string()),
  wordCount: z.number(),
  generatedAt: z.string().optional(),
});

export type FollowupSummaryResult = z.infer<typeof FollowupSummaryResultSchema>;

// 3. Validation Type Guard Functions using Zod safeParse
export function validatePrimaryResult(data: unknown): data is PrimaryAnalysisResult {
  const parseResult = PrimaryAnalysisResultSchema.safeParse(data);
  return parseResult.success;
}

export function validateFollowupResult(data: unknown): data is FollowupSummaryResult {
  const parseResult = FollowupSummaryResultSchema.safeParse(data);
  return parseResult.success;
}
