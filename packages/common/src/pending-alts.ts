// =============================================================================
// PENDING ALT REPORTS - Mod confirmation required before applying
// Prevents abuse where bad actors could falsely link innocent users
// =============================================================================

import { TriggerContext, JobContext } from '@devvit/public-api';
import { getLeaderboard, registerUserAlt, registerSubredditAlt } from './leaderboard.js';

type AppContext = TriggerContext | JobContext;

const PENDING_ALTS_KEY = 'hub-bot:pending-alts';

export interface PendingAltReport {
  id: string;
  type: 'user' | 'subreddit';
  altName: string;
  mainName: string;
  reportedBy: string;
  reportedAt: number;
  sourceCommentId: string;
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * Submit a pending alt report for mod review
 * Does NOT apply the alt link - requires mod approval first
 */
export async function submitPendingAltReport(
  context: AppContext,
  report: Omit<PendingAltReport, 'id' | 'reportedAt' | 'status'>
): Promise<{ success: boolean; reportId: string; message: string }> {
  const reportId = `alt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const pendingReport: PendingAltReport = {
    ...report,
    id: reportId,
    reportedAt: Date.now(),
    status: 'pending',
  };

  // Validate: can't link same name
  if (report.altName.toLowerCase() === report.mainName.toLowerCase()) {
    return { success: false, reportId: '', message: "Can't link to itself" };
  }

  // Check if already an alt
  const data = await getLeaderboard(context);
  if (data) {
    if (report.type === 'user' && data.userAltMappings[report.mainName.toLowerCase()]) {
      return { success: false, reportId: '', message: `u/${report.mainName} is already registered as an alt` };
    }
    if (report.type === 'subreddit' && data.subredditAltMappings[report.mainName.toLowerCase()]) {
      return { success: false, reportId: '', message: `r/${report.mainName} is already registered as an alt` };
    }
  }

  // Store pending report
  const pendingReports = await getPendingAltReports(context);
  pendingReports.push(pendingReport);

  await context.redis.set(PENDING_ALTS_KEY, JSON.stringify(pendingReports), {
    expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });

  return {
    success: true,
    reportId,
    message: 'Report submitted for mod review'
  };
}

/**
 * Get all pending alt reports
 */
export async function getPendingAltReports(
  context: AppContext
): Promise<PendingAltReport[]> {
  try {
    const data = await context.redis.get(PENDING_ALTS_KEY);
    if (!data) return [];
    const reports = JSON.parse(data) as PendingAltReport[];
    // Only return pending ones
    return reports.filter(r => r.status === 'pending');
  } catch {
    return [];
  }
}

/**
 * Approve a pending alt report - applies the alt link
 */
export async function approveAltReport(
  context: AppContext,
  reportId: string
): Promise<{ success: boolean; message: string }> {
  const allReports = await getAllAltReports(context);
  const reportIndex = allReports.findIndex(r => r.id === reportId);

  if (reportIndex === -1) {
    return { success: false, message: 'Report not found' };
  }

  const report = allReports[reportIndex];

  if (report.status !== 'pending') {
    return { success: false, message: `Report already ${report.status}` };
  }

  // Apply the alt link
  let result: { success: boolean; message: string };
  if (report.type === 'user') {
    result = await registerUserAlt(context, report.altName, report.mainName);
  } else {
    result = await registerSubredditAlt(context, report.altName, report.mainName);
  }

  if (result.success) {
    // Mark as approved
    allReports[reportIndex].status = 'approved';
    await saveAllAltReports(context, allReports);
  }

  return result;
}

/**
 * Reject a pending alt report
 */
export async function rejectAltReport(
  context: AppContext,
  reportId: string
): Promise<{ success: boolean; message: string }> {
  const allReports = await getAllAltReports(context);
  const reportIndex = allReports.findIndex(r => r.id === reportId);

  if (reportIndex === -1) {
    return { success: false, message: 'Report not found' };
  }

  const report = allReports[reportIndex];

  if (report.status !== 'pending') {
    return { success: false, message: `Report already ${report.status}` };
  }

  allReports[reportIndex].status = 'rejected';
  await saveAllAltReports(context, allReports);

  return { success: true, message: 'Report rejected' };
}

/**
 * Get report by ID
 */
export async function getAltReportById(
  context: AppContext,
  reportId: string
): Promise<PendingAltReport | null> {
  const allReports = await getAllAltReports(context);
  return allReports.find(r => r.id === reportId) || null;
}

/**
 * Format modmail body for alt report approval
 */
export function formatAltReportModmail(report: PendingAltReport, subredditName: string): string {
  const prefix = report.type === 'user' ? 'u' : 'r';
  return `## Alt Account Report

**Reported by:** u/${report.reportedBy}
**Type:** ${report.type}
**Claim:** ${prefix}/${report.altName} is an alt of ${prefix}/${report.mainName}

---

**To approve this report**, reply to this message with:
\`!approve ${report.id}\`

**To reject this report**, reply to this message with:
\`!reject ${report.id}\`

---

^(Report ID: ${report.id})
^(This report will expire in 30 days if not acted upon.)`;
}

// Internal helpers
async function getAllAltReports(context: AppContext): Promise<PendingAltReport[]> {
  try {
    const data = await context.redis.get(PENDING_ALTS_KEY);
    if (!data) return [];
    return JSON.parse(data) as PendingAltReport[];
  } catch {
    return [];
  }
}

async function saveAllAltReports(context: AppContext, reports: PendingAltReport[]): Promise<void> {
  // Keep last 100 reports (prune old ones)
  const recentReports = reports.slice(-100);
  await context.redis.set(PENDING_ALTS_KEY, JSON.stringify(recentReports), {
    expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
}
