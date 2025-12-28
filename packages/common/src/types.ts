// Shared types for hub-bot-9000 apps

export enum SourceClassification {
  FRIENDLY = 'friendly',
  NEUTRAL = 'neutral',
  ADVERSARIAL = 'adversarial',
  HATEFUL = 'hateful',
}

export enum AIProvider {
  NONE = 'none',
  REDDIT = 'reddit',
  GEMINI = 'gemini',
}

export interface ClassificationResult {
  classification: SourceClassification;
  method: 'mod_list' | 'ai_analysis' | 'default';
  cachedAt?: number;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface BotSettings {
  enabled: boolean;
  aiProvider: AIProvider;
  geminiApiKey?: string;
}
