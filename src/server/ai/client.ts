import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { AI_CONFIG } from '@/server/config/ai.config';

/**
 * AI Provider Client Initialization Wrapper
 * 
 * Rules from AGENTS.md & ai-pipeline.md:
 * - Official SDK clients set up here.
 * - API keys are read from environment variables (written by human into .env).
 * - All provider endpoints and model IDs imported from AI_CONFIG (never hardcoded inline).
 */

/**
 * Official Google Gen AI SDK configured for Gemini Endpoint (Role 1)
 */
export const geminiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
});

/**
 * Official OpenAI SDK configured for DeepSeek API Endpoint (Role 2)
 */
export const deepseekClient = new OpenAI({
  baseURL: AI_CONFIG.providers.deepseek.baseUrl,
  apiKey: process.env.DEEPSEEK_API_KEY || '',
});

export const aiClient = {
  getGeminiClient(): GoogleGenAI {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not set.');
    }
    return geminiClient;
  },

  getDeepSeekClient(): OpenAI {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY environment variable is not set.');
    }
    return deepseekClient;
  },

  isConfigured(): boolean {
    return Boolean(
      (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) &&
      process.env.DEEPSEEK_API_KEY
    );
  },
};
