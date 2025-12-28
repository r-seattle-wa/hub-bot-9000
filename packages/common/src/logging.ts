// Structured logging for GCP Cloud Logging
// These events are captured by log-based metrics in Terraform

import { SourceClassification } from './types.js';

// Event types that match Terraform log-based metrics
export type LogEvent =
  | 'hostile_crosslink'
  | 'brigade_pattern'
  | 'deleted_content_detected'
  | 'osint_flagged_content'
  | 'behavioral_analysis'
  | 'mod_log_spam_found'
  | 'leaderboard_update'
  | 'pullpush_error'
  | 'gemini_error';

interface BaseLogPayload {
  event: LogEvent;
  timestamp?: number;
}

// =============================================================================
// Detection Events
// =============================================================================

interface HostileCrosslinkPayload extends BaseLogPayload {
  event: 'hostile_crosslink';
  source_subreddit: string;
  classification: SourceClassification;
  target_post?: string;
  source_url?: string;
}

interface BrigadePatternPayload extends BaseLogPayload {
  event: 'brigade_pattern';
  source_subreddit: string;
  link_count: number;
  time_window_hours?: number;
}

interface DeletedContentPayload extends BaseLogPayload {
  event: 'deleted_content_detected';
  post_id: string;
  deleted_count: number;
  time_since_post_hours?: number;
}

interface OSINTFlaggedPayload extends BaseLogPayload {
  event: 'osint_flagged_content';
  username: string;
  severity: 'low' | 'moderate' | 'severe';
  reason: string;
  content_preview?: string;
}

interface BehavioralAnalysisPayload extends BaseLogPayload {
  event: 'behavioral_analysis';
  username: string;
  sockpuppet_risk: 'low' | 'moderate' | 'high';
  trolling_likelihood?: 'low' | 'moderate' | 'high';
  similar_to?: string;
  confidence?: 'low' | 'moderate' | 'high';
}

interface ModLogSpamPayload extends BaseLogPayload {
  event: 'mod_log_spam_found';
  username: string;
  spam_count: number;
  action_types?: string[];
}

interface LeaderboardUpdatePayload extends BaseLogPayload {
  event: 'leaderboard_update';
  update_type: 'subreddit' | 'user';
  entity_name: string;
  new_score: number;
  score_delta?: number;
}

// =============================================================================
// Error Events
// =============================================================================

interface PullPushErrorPayload extends BaseLogPayload {
  event: 'pullpush_error';
  error_type: 'timeout' | 'rate_limit' | 'unavailable' | 'parse_error' | 'unknown';
  endpoint?: string;
  status_code?: number;
  message?: string;
}

interface GeminiErrorPayload extends BaseLogPayload {
  event: 'gemini_error';
  error_type: 'auth' | 'rate_limit' | 'quota' | 'parse_error' | 'timeout' | 'unknown';
  operation?: string;
  status_code?: number;
  message?: string;
}

type LogPayload =
  | HostileCrosslinkPayload
  | BrigadePatternPayload
  | DeletedContentPayload
  | OSINTFlaggedPayload
  | BehavioralAnalysisPayload
  | ModLogSpamPayload
  | LeaderboardUpdatePayload
  | PullPushErrorPayload
  | GeminiErrorPayload;

/**
 * Emit a structured log event for GCP Cloud Logging
 * These logs are captured by log-based metrics defined in Terraform
 */
export function logEvent(payload: LogPayload): void {
  const enriched = {
    ...payload,
    timestamp: payload.timestamp || Date.now(),
  };

  // In Cloud Run, console.log outputs are captured by Cloud Logging
  // Using JSON.stringify ensures structured logging
  console.log(JSON.stringify(enriched));
}

// =============================================================================
// Convenience Functions
// =============================================================================

export function logHostileCrosslink(
  sourceSubreddit: string,
  classification: SourceClassification,
  options?: { targetPost?: string; sourceUrl?: string }
): void {
  logEvent({
    event: 'hostile_crosslink',
    source_subreddit: sourceSubreddit,
    classification,
    target_post: options?.targetPost,
    source_url: options?.sourceUrl,
  });
}

export function logBrigadePattern(
  sourceSubreddit: string,
  linkCount: number,
  timeWindowHours?: number
): void {
  logEvent({
    event: 'brigade_pattern',
    source_subreddit: sourceSubreddit,
    link_count: linkCount,
    time_window_hours: timeWindowHours,
  });
}

export function logDeletedContent(
  postId: string,
  deletedCount: number,
  timeSincePostHours?: number
): void {
  logEvent({
    event: 'deleted_content_detected',
    post_id: postId,
    deleted_count: deletedCount,
    time_since_post_hours: timeSincePostHours,
  });
}

export function logOSINTFlagged(
  username: string,
  severity: 'low' | 'moderate' | 'severe',
  reason: string,
  contentPreview?: string
): void {
  logEvent({
    event: 'osint_flagged_content',
    username,
    severity,
    reason,
    content_preview: contentPreview?.slice(0, 100),
  });
}

export function logBehavioralAnalysis(
  username: string,
  sockpuppetRisk: 'low' | 'moderate' | 'high',
  options?: {
    trollingLikelihood?: 'low' | 'moderate' | 'high';
    similarTo?: string;
    confidence?: 'low' | 'moderate' | 'high';
  }
): void {
  logEvent({
    event: 'behavioral_analysis',
    username,
    sockpuppet_risk: sockpuppetRisk,
    trolling_likelihood: options?.trollingLikelihood,
    similar_to: options?.similarTo,
    confidence: options?.confidence,
  });
}

export function logModLogSpam(
  username: string,
  spamCount: number,
  actionTypes?: string[]
): void {
  logEvent({
    event: 'mod_log_spam_found',
    username,
    spam_count: spamCount,
    action_types: actionTypes,
  });
}

export function logLeaderboardUpdate(
  updateType: 'subreddit' | 'user',
  entityName: string,
  newScore: number,
  scoreDelta?: number
): void {
  logEvent({
    event: 'leaderboard_update',
    update_type: updateType,
    entity_name: entityName,
    new_score: newScore,
    score_delta: scoreDelta,
  });
}

export function logPullPushError(
  errorType: PullPushErrorPayload['error_type'],
  options?: { endpoint?: string; statusCode?: number; message?: string }
): void {
  logEvent({
    event: 'pullpush_error',
    error_type: errorType,
    endpoint: options?.endpoint,
    status_code: options?.statusCode,
    message: options?.message,
  });
}

export function logGeminiError(
  errorType: GeminiErrorPayload['error_type'],
  options?: { operation?: string; statusCode?: number; message?: string }
): void {
  logEvent({
    event: 'gemini_error',
    error_type: errorType,
    operation: options?.operation,
    status_code: options?.statusCode,
    message: options?.message,
  });
}
