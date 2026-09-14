/**
 * Centralized AI & Pipeline Configuration
 * 
 * ALL model identifiers, timeouts, token caps, temperatures, rate limits, 
 * file upload limits, concurrency caps, and provider settings MUST be defined here.
 * Never hardcode these values in route handlers, workers, or business logic files.
 */

export const AI_CONFIG = {
  // Model Identifiers
  models: {
    // Role 1: Document & Notes Extractor (Gemini Vision / Multimodal)
    roleOneModelId: 'gemini-3.6-flash',
    // Role 2: Synthesis & Structuring / Follow-up (DeepSeek Chat)
    roleTwoModelId: 'deepseek-chat',
  },

  // Provider Endpoints & System Configurations
  providers: {
    deepseek: {
      // Official DeepSeek OpenAI-compatible API base URL
      baseUrl: 'https://api.deepseek.com',
      // DeepSeek JSON response format setting
      responseFormatType: 'json_object' as const,
    },
    gemini: {
      // Default multimodal OCR model
      defaultModel: 'gemini-3.6-flash',
    },
  },

  // Model Hyperparameters
  parameters: {
    // Role 1 (Gemini) Hyperparameters
    roleOne: {
      // Low temperature (0.2) for deterministic OCR text/handwriting extraction
      temperature: 0.2,
      // Token cap (4096) to bound spending while allowing complete note extractions
      outputTokenCap: 4096,
    },
    // Role 2 (DeepSeek) Hyperparameters
    roleTwo: {
      // Low temperature (0.2) for deterministic JSON structure output
      temperature: 0.2,
      // Output token cap (4096) for structured responses and executive summaries
      outputTokenCap: 4096,
    },
    // Global Hyperparameters (Legacy / Shared references)
    temperature: 0.2,
    outputTokenCap: 4096,
  },

  // Execution & Resilience Constraints
  limits: {
    // Role 1 (Gemini OCR Vision) model call timeout in milliseconds (45 seconds) for image/multimodal processing
    roleOneTimeoutMs: 45000,
    // Role 2 (DeepSeek Structuring) model call timeout in milliseconds (30 seconds) for JSON output structuring
    roleTwoTimeoutMs: 30000,
    // General fallback model call timeout in milliseconds (45 seconds)
    timeoutMs: 45000,
    // Maximum retry attempts for failed structured output validation
    maxValidationRetries: 1,
    // Maximum worker attempts before marking job permanently failed
    maxJobAttempts: 3,
  },

  // Queue & Concurrency Controls
  concurrency: {
    // Max simultaneous AI processing tasks in flight to stay within rate caps and memory limits
    maxConcurrentJobs: 2,
    // Background job processing delay in milliseconds for stubbed execution
    stubProcessingDelayMs: 2500,
  },

  // Default Fallback Values & Action Names
  defaults: {
    // Fallback confidence score when AI model confidence is unavailable
    confidenceScore: 0.95,
    // Name of the follow-up action
    followupActionName: 'Summarise',
    // Fallback word count for summary outputs
    fallbackWordCount: 38,
  },

  // Endpoint Rate Limiting Controls
  rateLimit: {
    // Trigger endpoint (/api/upload): Max 5 upload triggers per 60 seconds per user/IP
    uploadTrigger: {
      windowMs: 60 * 1000,
      maxRequests: 5,
    },
    // Follow-up endpoint (/api/jobs/[id]/followup): Max 5 follow-up triggers per 60 seconds per user/IP
    followupAction: {
      windowMs: 60 * 1000,
      maxRequests: 5,
    },
  },

  // File Upload Restrictions (Enforced server-side)
  storage: {
    // Maximum allowed file size in bytes (10MB) to prevent memory overflow
    maxFileSizeBytes: 10 * 1024 * 1024,
    // Allowed MIME types for document and handwritten note uploads
    allowedMimeTypes: [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'text/plain',
      'text/markdown',
    ],
  },
} as const;
