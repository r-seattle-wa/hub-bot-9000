/**
 * Moon phase calculation service
 * Based on astronomical algorithms
 */

const MOON_EMOJIS = {
  'New Moon': '🌑',
  'Waxing Crescent': '🌒',
  'First Quarter': '🌓',
  'Waxing Gibbous': '🌔',
  'Full Moon': '🌕',
  'Waning Gibbous': '🌖',
  'Last Quarter': '🌗',
  'Waning Crescent': '🌘',
};

/**
 * Calculate moon phase for a given date
 * Returns a value between 0 and 1 representing the lunar cycle
 * 0 = New Moon, 0.5 = Full Moon
 */
export function getMoonPhaseValue(date: Date = new Date()): number {
  // Known new moon: January 6, 2000 at 18:14 UTC
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.53059; // days

  const daysSinceKnown = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const phase = (daysSinceKnown % lunarCycle) / lunarCycle;

  return phase < 0 ? phase + 1 : phase;
}

/**
 * Get moon phase name from phase value
 */
export function getMoonPhaseName(phaseValue: number): string {
  if (phaseValue < 0.0625) return 'New Moon';
  if (phaseValue < 0.1875) return 'Waxing Crescent';
  if (phaseValue < 0.3125) return 'First Quarter';
  if (phaseValue < 0.4375) return 'Waxing Gibbous';
  if (phaseValue < 0.5625) return 'Full Moon';
  if (phaseValue < 0.6875) return 'Waning Gibbous';
  if (phaseValue < 0.8125) return 'Last Quarter';
  if (phaseValue < 0.9375) return 'Waning Crescent';
  return 'New Moon';
}

/**
 * Get moon emoji for current phase
 */
export function getMoonEmoji(date: Date = new Date()): string {
  const phaseValue = getMoonPhaseValue(date);
  const phaseName = getMoonPhaseName(phaseValue);
  return MOON_EMOJIS[phaseName as keyof typeof MOON_EMOJIS] || '🌙';
}

/**
 * Get formatted moon phase string
 */
export function formatMoonPhase(date: Date = new Date()): string {
  const phaseValue = getMoonPhaseValue(date);
  const phaseName = getMoonPhaseName(phaseValue);
  const emoji = MOON_EMOJIS[phaseName as keyof typeof MOON_EMOJIS] || '🌙';

  return `${emoji} ${phaseName}`;
}
