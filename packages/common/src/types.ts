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
  GROQ = 'groq',
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

// Sarcasm levels for farewell-hero responses
export enum SarcasmLevel {
  POLITE = 'polite',
  NEUTRAL = 'neutral',
  SNARKY = 'snarky',
  ROAST = 'roast',
  FREAKOUT = 'freakout',
}

// User tone detection for incoming messages
export enum UserTone {
  POLITE = 'polite',
  NEUTRAL = 'neutral',
  FRUSTRATED = 'frustrated',
  HOSTILE = 'hostile',
  DRAMATIC = 'dramatic',
}

// Event types for the unified event feed
export enum HubBotEventType {
  BRIGADE_ALERT = 'brigade_alert',
  HAIKU_DETECTION = 'haiku_detection',
  FAREWELL_ANNOUNCEMENT = 'farewell_announcement',
  COURT_DOCKET = 'court_docket',
  OUTGOING_LINK = 'outgoing_link',
  TRAFFIC_SPIKE = 'traffic_spike',
  COMMUNITY_EVENT = 'community_event',
  SYSTEM = 'system',
  TRIBUTE = 'tribute',
}

// Base event interface
interface HubBotEventBase {
  id: string;
  type: HubBotEventType;
  createdAt: number;
  expiresAt: number;
  sourceApp: string;
  subreddit: string;
}

// Brigade alert event
export interface BrigadeAlertEvent extends HubBotEventBase {
  type: HubBotEventType.BRIGADE_ALERT;
  sourceSubreddit: string;
  sourceUrl: string;
  targetPostId: string;
  classification: SourceClassification;
}

// Haiku detection event
export interface HaikuDetectionEvent extends HubBotEventBase {
  type: HubBotEventType.HAIKU_DETECTION;
  username: string;
  haiku: string;
  sourceId: string;
  isPost: boolean;
}

// Farewell announcement event
export interface FarewellAnnouncementEvent extends HubBotEventBase {
  type: HubBotEventType.FAREWELL_ANNOUNCEMENT;
  username: string;
  totalPosts: number;
  totalComments: number;
  isPowerUser: boolean;
  sarcasmUsed: SarcasmLevel;
  detectedTone: UserTone;
}

// Court docket event
export interface CourtDocketEvent extends HubBotEventBase {
  type: HubBotEventType.COURT_DOCKET;
  defendant: string;
  charge: string;
  postUrl: string;
  postTitle: string;
}

// Outgoing link event - when users link to hostile subreddits
export interface OutgoingLinkEvent extends HubBotEventBase {
  type: HubBotEventType.OUTGOING_LINK;
  authorName: string;
  targetSubreddit: string;
  sourceCommentId?: string;
  sourcePostId?: string;
  classification: SourceClassification;
}

// Traffic spike event - unusual comment velocity detected
export interface TrafficSpikeEvent extends HubBotEventBase {
  type: HubBotEventType.TRAFFIC_SPIKE;
  postId: string;
  postTitle?: string;
  commentsInWindow: number;
  windowMinutes: number;
  threshold: number;
}

// Community event (from scraper-service)
export interface CommunityEventEvent extends HubBotEventBase {
  type: HubBotEventType.COMMUNITY_EVENT;
  title: string;
  description?: string;
  eventDate: string;      // YYYY-MM-DD
  location?: string;
  url?: string;
  source: string;         // e.g., 'eventbrite', 'ticketmaster', 'gemini'
}


// Tribute event - satirical content generated for subreddit/user
export interface TributeEvent extends HubBotEventBase {
  type: HubBotEventType.TRIBUTE;
  targetName: string;
  targetType: 'subreddit' | 'user';
  tribute: string;
  sarcasmLevel: SarcasmLevel;
  requestedBy: string;
  hasImage: boolean;
}

// System event
export interface SystemEvent extends HubBotEventBase {
  type: HubBotEventType.SYSTEM;
  message: string;
}

// Discriminated union of all event types
export type HubBotEvent =
  | BrigadeAlertEvent
  | HaikuDetectionEvent
  | FarewellAnnouncementEvent
  | CourtDocketEvent
  | OutgoingLinkEvent
  | TrafficSpikeEvent
  | CommunityEventEvent
  | SystemEvent
  | TributeEvent;

// Tone classification result
export interface ToneClassificationResult {
  tone: UserTone;
  triggerPhrase?: string;
  reasoning?: string;
  confidence: number;
}
