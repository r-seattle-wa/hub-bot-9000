// Detection tests for memes, achievements, and thread analysis
import { describe, it, expect } from 'vitest';
import { detectTalkingPoints, TALKING_POINTS } from '../meme-detector.js';
import { ACHIEVEMENTS, AchievementTier } from '../achievements.js';

describe('Meme Detection', () => {
  it('should detect echo chamber references', () => {
    const texts = [
      'This sub is such an echo chamber',
      'Classic circlejerk behavior',
      'The hivemind has spoken',
    ];

    for (const text of texts) {
      const detected = detectTalkingPoints(text);
      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0].id).toBe('echo_chamber');
    }
  });

  it('should detect transplant complaints', () => {
    const texts = [
      'Transplants ruined Seattle',
      'Californians took over everything',
      'Go back to California',
      'Tech bros destroyed the city',
    ];

    for (const text of texts) {
      const detected = detectTalkingPoints(text);
      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0].id).toBe('transplants');
    }
  });

  it('should detect mod abuse claims', () => {
    const texts = [
      'The mods are corrupt',
      'Power tripping mods banned me',
      'Mods silence dissent',
      'Ban happy mods',
    ];

    for (const text of texts) {
      const detected = detectTalkingPoints(text);
      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0].id).toBe('mod_abuse');
    }
  });

  it('should detect liberal bias claims', () => {
    const texts = [
      'This is such a liberal bubble',
      'Leftist sub gonna leftist',
      'Democrat propaganda everywhere',
    ];

    for (const text of texts) {
      const detected = detectTalkingPoints(text);
      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0].id).toBe('liberal_bias');
    }
  });

  it('should detect generic cope/seethe', () => {
    const detected = detectTalkingPoints('cope and seethe libs');
    expect(detected.some(d => d.id === 'cope')).toBe(true);
  });

  it('should detect multiple memes in one text', () => {
    const text = 'This echo chamber is full of transplants and corrupt mods';
    const detected = detectTalkingPoints(text);
    const ids = detected.map(d => d.id);

    expect(ids).toContain('echo_chamber');
    expect(ids).toContain('transplants');
    expect(ids).toContain('mod_abuse');
  });

  it('should NOT detect false positives', () => {
    const texts = [
      'I love Seattle',
      'The weather is nice today',
      'Check out this restaurant',
      'Moving to a new apartment',
    ];

    for (const text of texts) {
      const detected = detectTalkingPoints(text);
      expect(detected.length).toBe(0);
    }
  });
});

describe('Sample Drama Quotes Detection', () => {
  // Real examples from the SubredditDrama thread
  const sampleQuotes = [
    {
      quote: "There's literally like 70 accounts that only post on that sub just to harass people. Most of them likely the same person.",
      expectedMemes: [], // No memes, just observation
    },
    {
      quote: "It's a maga sub that masquerades as a local subreddit. The main seattle sub is much better.",
      expectedMemes: [], // Political observation, not a talking point pattern
    },
    {
      quote: "That sub is such an echo chamber of right-wing talking points",
      expectedMemes: ['echo_chamber'],
    },
    {
      quote: "The mods are corrupt and power tripping",
      expectedMemes: ['mod_abuse'],
    },
    {
      quote: "Bunch of transplants complaining about other transplants ruining Seattle",
      expectedMemes: ['transplants'],
    },
    {
      quote: "Classic leftist sub circlejerk",
      expectedMemes: ['echo_chamber', 'liberal_bias'],
    },
  ];

  for (const { quote, expectedMemes } of sampleQuotes) {
    it(`should detect ${expectedMemes.length} memes in: "${quote.slice(0, 50)}..."`, () => {
      const detected = detectTalkingPoints(quote);
      const detectedIds = detected.map(d => d.id);

      for (const meme of expectedMemes) {
        expect(detectedIds).toContain(meme);
      }

      if (expectedMemes.length === 0) {
        expect(detected.length).toBe(0);
      }
    });
  }
});

describe('Achievement Definitions', () => {
  it('should have all achievement tiers represented', () => {
    const tiers = new Set(ACHIEVEMENTS.map(a => a.tier));
    expect(tiers.has(AchievementTier.BRONZE)).toBe(true);
    expect(tiers.has(AchievementTier.SILVER)).toBe(true);
    expect(tiers.has(AchievementTier.GOLD)).toBe(true);
    expect(tiers.has(AchievementTier.PLATINUM)).toBe(true);
    expect(tiers.has(AchievementTier.DIAMOND)).toBe(true);
  });

  it('should have score-based achievements', () => {
    const scoreAchievements = ACHIEVEMENTS.filter(a => a.scoreThreshold);
    expect(scoreAchievements.length).toBeGreaterThanOrEqual(5);

    // Check thresholds are reasonable progression
    const thresholds = scoreAchievements.map(a => a.scoreThreshold!).sort((a, b) => a - b);
    expect(thresholds).toEqual([5, 10, 25, 50, 100]);
  });

  it('should have rank-based achievements', () => {
    const rankAchievements = ACHIEVEMENTS.filter(a => a.rankThreshold);
    expect(rankAchievements.length).toBeGreaterThanOrEqual(3);
  });

  it('should have meme-specific achievements', () => {
    const memeAchievements = ACHIEVEMENTS.filter(a =>
      a.special?.includes('chamber') ||
      a.special?.includes('transplant') ||
      a.special?.includes('meme')
    );
    expect(memeAchievements.length).toBeGreaterThanOrEqual(3);
  });

  it('should have first offense achievement', () => {
    const firstOffense = ACHIEVEMENTS.find(a => a.special === 'first_offense');
    expect(firstOffense).toBeDefined();
    expect(firstOffense?.id).toBe('new_challenger');
    expect(firstOffense?.tier).toBe('bronze');
  });

  it('should have unique IDs', () => {
    const ids = ACHIEVEMENTS.map(a => a.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should have roast templates for all achievements', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.roastTemplate).toBeDefined();
      expect(a.roastTemplate.length).toBeGreaterThan(10);
    }
  });
});

describe('Talking Points Coverage', () => {
  it('should have all expected categories', () => {
    const categories = new Set(TALKING_POINTS.map(tp => tp.category));
    expect(categories.has('political')).toBe(true);
    expect(categories.has('demographic')).toBe(true);
    expect(categories.has('meta')).toBe(true);
    expect(categories.has('generic')).toBe(true);
  });

  it('should have unique IDs', () => {
    const ids = TALKING_POINTS.map(tp => tp.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should have patterns or keywords for each', () => {
    for (const tp of TALKING_POINTS) {
      const hasDetection = tp.patterns.length > 0 || tp.keywords.length > 0;
      expect(hasDetection).toBe(true);
    }
  });
});
