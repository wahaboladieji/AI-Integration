import { aiClient } from '@/server/ai/client';
import { AI_CONFIG } from '@/server/config/ai.config';
import { ROLE_ONE_SYSTEM_PROMPT } from '@/server/ai/prompts/role-one.prompt';
import { ROLE_TWO_SYSTEM_PROMPT, ROLE_TWO_FOLLOWUP_PROMPT } from '@/server/ai/prompts/role-two.prompt';
import { PrimaryAnalysisResult, FollowupSummaryResult } from '@/server/ai/schemas/result.schema';

/**
 * Model Execution Wrapper & Resilience Engine
 * 
 * Rules from AGENTS.md, structured-output-validation-and-retry, & ai-pipeline.md:
 * - Role 1 (Gemini): Multi-modal visual/text OCR extraction.
 * - Role 2 (DeepSeek): JSON structuring, validation, retries, and follow-up synthesis.
 * - Timeout enforced on every model call via Promise.race.
 * - Structured output validated in application code, not blindly trusted.
 * - ALL model hyperparameters, timeouts, token caps, response formats, and model IDs are imported from AI_CONFIG.
 */

/**
 * Helper to wrap promises with a strict timeout configured in ai.config.ts
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise,
  ]);
}

export interface GeminiFileInput {
  fileBuffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Role 1 (Gemini): Extracts handwritten text/content from binary file buffer(s) or plain text
 */
export async function runGeminiExtraction(
  fileInput: GeminiFileInput | GeminiFileInput[]
): Promise<string> {
  const gemini = aiClient.getGeminiClient();
  const fileItems = Array.isArray(fileInput) ? fileInput : [fileInput];
  const combinedFilenames = fileItems.map((f) => f.filename).join(', ');

  const parts: any[] = [
    {
      text: `${ROLE_ONE_SYSTEM_PROMPT}\n\nUploaded Files (${fileItems.length}): ${combinedFilenames}\nAnalyze and transcribe all visible handwritten text, printed content, and annotations across all provided files verbatim into a single continuous extraction.`,
    },
  ];

  for (const item of fileItems) {
    const isImageOrPdf = item.mimeType.startsWith('image/') || item.mimeType === 'application/pdf';
    parts.push({
      text: `--- Start of File: ${item.filename} (${item.mimeType}) ---`,
    });
    if (isImageOrPdf) {
      parts.push({
        inlineData: {
          mimeType: item.mimeType,
          data: item.fileBuffer.toString('base64'),
        },
      });
    } else {
      parts.push({
        text: `File Content:\n${item.fileBuffer.toString('utf-8')}`,
      });
    }
  }

  const modelCall = async () => {
    const response = await gemini.models.generateContent({
      model: AI_CONFIG.models.roleOneModelId,
      contents: [
        {
          role: 'user',
          parts: parts,
        },
      ],
      config: {
        temperature: AI_CONFIG.parameters.roleOne.temperature,
        maxOutputTokens: AI_CONFIG.parameters.roleOne.outputTokenCap,
      },
    });
    return response.text || '';
  };

  return withTimeout(modelCall(), AI_CONFIG.limits.roleOneTimeoutMs, 'Gemini OCR Extraction');
}

/**
 * Role 2 (DeepSeek): Structures extracted raw text into validated JSON
 */
export async function runDeepSeekStructuring(
  extractedText: string,
  filename: string,
  mimeType: string,
  validator: (data: unknown) => data is PrimaryAnalysisResult,
  fallbackData: PrimaryAnalysisResult
): Promise<{ data: PrimaryAnalysisResult; rawOutput: string }> {
  const deepseek = aiClient.getDeepSeekClient();

  const userPrompt = `
Transform the following extracted handwritten notes/document content into structured JSON.

Document Filename: ${filename}
MIME Type: ${mimeType}

Extracted Text Content:
"""
${extractedText}
"""

Required JSON Schema Format:
{
  "documentType": string (e.g. "Handwritten Note", "Technical Specification", "Document Summary"),
  "originalFilename": "${filename}",
  "extractedTopics": string[] (array of top 3-5 main topics),
  "structuredNotes": [
    {
      "section": string (section heading, e.g. "Overview", "Key Takeaways", "Action Items"),
      "content": string (detailed text content for this section)
    }
  ],
  "confidenceScore": number (float between 0.0 and 1.0 representing legibility/completeness)
}
  `.trim();

  let attempts = 0;
  const maxAttempts = AI_CONFIG.limits.maxValidationRetries + 1; // initial + retries
  let lastRawOutput = '';
  let lastError: Error | null = null;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const modelCall = async () => {
        const completion = await deepseek.chat.completions.create({
          model: AI_CONFIG.models.roleTwoModelId,
          messages: [
            { role: 'system', content: ROLE_TWO_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: AI_CONFIG.providers.deepseek.responseFormatType },
          temperature: AI_CONFIG.parameters.roleTwo.temperature,
          max_tokens: AI_CONFIG.parameters.roleTwo.outputTokenCap,
        });
        return completion.choices[0]?.message?.content || '';
      };

      lastRawOutput = await withTimeout(modelCall(), AI_CONFIG.limits.roleTwoTimeoutMs, 'DeepSeek JSON Structuring');
      
      const parsed = JSON.parse(lastRawOutput);
      // Inject required originalFilename & processedAt if missing/needed
      parsed.originalFilename = filename;
      parsed.processedAt = new Date().toISOString();
      parsed.rawTranscription = extractedText;

      if (validator(parsed)) {
        return { data: parsed, rawOutput: lastRawOutput };
      } else {
        throw new Error(`JSON schema validation failed on attempt ${attempts}`);
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`DeepSeek structuring attempt ${attempts} failed: ${err.message}`);
    }
  }

  // Graceful fallback if retries exhausted
  console.error(`DeepSeek structuring failed after ${maxAttempts} attempts. Using fallback structure.`);
  const gracefulData: PrimaryAnalysisResult = {
    ...fallbackData,
    confidenceScore: AI_CONFIG.defaults.confidenceScore,
    rawTranscription: extractedText,
    processedAt: new Date().toISOString(),
  };

  return {
    data: gracefulData,
    rawOutput: lastRawOutput || JSON.stringify(gracefulData, null, 2),
  };
}

/**
 * Role 2 (DeepSeek): Executive Summarizer for Follow-up Actions
 */
export async function runDeepSeekFollowup(
  parentResult: PrimaryAnalysisResult,
  validator: (data: unknown) => data is FollowupSummaryResult,
  fallbackData: FollowupSummaryResult
): Promise<{ data: FollowupSummaryResult; rawOutput: string }> {
  const deepseek = aiClient.getDeepSeekClient();

  const userPrompt = `
Generate an executive summary and key action items from the following structured document analysis:

Document Filename: ${parentResult.originalFilename}
Document Type: ${parentResult.documentType}
Topics: ${parentResult.extractedTopics.join(', ')}

Structured Content:
${JSON.stringify(parentResult.structuredNotes, null, 2)}

Required JSON Schema Format:
{
  "action": "${AI_CONFIG.defaults.followupActionName}",
  "summaryTitle": string (e.g. "Executive Summary & Action Plan"),
  "keyPoints": string[] (array of 3-5 concise bullet points),
  "wordCount": number (total integer count of words in keyPoints),
  "generatedAt": string (ISO timestamp)
}
  `.trim();

  let attempts = 0;
  const maxAttempts = AI_CONFIG.limits.maxValidationRetries + 1;
  let lastRawOutput = '';

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const modelCall = async () => {
        const completion = await deepseek.chat.completions.create({
          model: AI_CONFIG.models.roleTwoModelId,
          messages: [
            { role: 'system', content: ROLE_TWO_FOLLOWUP_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: AI_CONFIG.providers.deepseek.responseFormatType },
          temperature: AI_CONFIG.parameters.roleTwo.temperature,
          max_tokens: AI_CONFIG.parameters.roleTwo.outputTokenCap,
        });
        return completion.choices[0]?.message?.content || '';
      };

      lastRawOutput = await withTimeout(modelCall(), AI_CONFIG.limits.roleTwoTimeoutMs, 'DeepSeek Follow-Up Summary');
      const parsed = JSON.parse(lastRawOutput);
      parsed.action = AI_CONFIG.defaults.followupActionName;
      parsed.generatedAt = new Date().toISOString();

      if (validator(parsed)) {
        return { data: parsed, rawOutput: lastRawOutput };
      } else {
        throw new Error(`Follow-up schema validation failed on attempt ${attempts}`);
      }
    } catch (err: any) {
      console.warn(`DeepSeek follow-up attempt ${attempts} failed: ${err.message}`);
    }
  }

  const gracefulData: FollowupSummaryResult = {
    ...fallbackData,
    action: AI_CONFIG.defaults.followupActionName,
    wordCount: AI_CONFIG.defaults.fallbackWordCount,
    generatedAt: new Date().toISOString(),
  };

  return {
    data: gracefulData,
    rawOutput: lastRawOutput || JSON.stringify(gracefulData, null, 2),
  };
}
