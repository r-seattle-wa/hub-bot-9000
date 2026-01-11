// Hater Achievement System
// Gamified recognition of dedicated haters with AI-generated roasts and badges

import { TriggerContext, JobContext } from '@devvit/public-api';
import { getJson, setJson, REDIS_PREFIX } from './redis.js';
import { UserHaterEntry, LeaderboardData } from './leaderboard.js';

type AppContext = TriggerContext | JobContext;

// Achievement tiers (Xbox-style)
export enum AchievementTier {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
  DIAMOND = 'diamond',
}

// Achievement definition
export interface Achievement {
  id: string;
  name: string;
  description: string;
  tier: AchievementTier;
  scoreThreshold?: number; // Min score to unlock
  rankThreshold?: number; // Min rank to unlock (e.g., top 10)
  special?:
    | 'first_offense'
    | 'alt_exposed'
    | 'meme_repeater'
    | 'streak'
    // Meme-specific
    | 'echo_chamber_user'
    | 'transplant_blamer'
    | 'mod_accuser'
    | 'meme_collector'
    | 'meme_master'
    // Farewell-specific
    | 'dramatic_exit'
    | 'repeat_announcer'
    | 'farewell_trilogy'
    | 'lurker_leaver'
    // Behavior-specific
    | 'hostile_tone'
    | 'multi_sub_hater'
    | 'deleted_evidence'
    | 'high_troll_risk'
    | 'deception_detected'
    // Villain achievements (new)
    | 'night_owl'
    | 'speedrunner'
    | 'comeback_king'
    | 'delete_and_retreat'
    | 'wall_of_text'
    | 'double_down'
    | 'whataboutism'
    | 'seattle_freeze'
    | 'rain_check'
    | 'rent_is_too_damn_high'
    // Hero achievements (new)
    | 'helpful_local'
    | 'peacemaker'
    | 'fact_checker'
    | 'welcomer'
    | 'og_local'
    | 'event_evangelist'
    | 'photo_pro'
    | 'good_faith_debater'
    | 'hidden_gem_hunter'
    // Chaotic neutral achievements (new)
    | 'weekend_warrior'
    | 'one_topic_wonder'
    | 'haiku_magnet'
    | 'early_bird'
    | 'lurker_emeritus'
    | 'contrarian'
    | 'necromancer'
    // Meta achievements (new)
    | 'achievement_hunter'
    | 'bot_whisperer'
    | 'hall_of_famer'
    | 'self_aware'
    | 'completionist'
    // Seattle-specific achievements (new)
    | 'umbrella_truther'
    | 'best_teriyaki'
    | 'mountain_out'
    | 'transit_takes'
    | 'techie_blamer'
    | 'old_seattle';
  imagePrompt: string; // For GenAI image generation
  roastTemplate: string; // Base template for AI to enhance
  seattleSpecific?: boolean; // If true, only shown when Seattle mode is on
}

// User's achievement record
export interface UserAchievements {
  username: string;
  unlockedAchievements: string[]; // Achievement IDs
  notifiedAchievements: string[]; // Already commented about
  lastAchievementAt: number;
  lastNotificationAt: number;
  totalAchievements: number;
  highestTier: AchievementTier;
}

// Achievement unlock result
export interface AchievementUnlock {
  achievement: Achievement;
  isNew: boolean; // First time unlocking
  shouldNotify: boolean; // Should post comment (cooldown check)
  leaderboardPosition: number;
  previousPosition?: number;
}

// Define all achievements
export const ACHIEVEMENTS: Achievement[] = [
  // ===== SCORE MILESTONES =====
  {
    id: 'casual_complainer',
    name: 'Casual Complainer',
    description: 'Achieved 5 salt points',
    tier: AchievementTier.BRONZE,
    scoreThreshold: 5,
    imagePrompt:
      'A small bronze participation trophy with a tiny salt shaker on top, pixel art style, retro gaming aesthetic',
    roastTemplate: 'Welcome to the leaderboard! Your dedication to mild annoyance has been noted.',
  },
  {
    id: 'serial_brigader',
    name: 'Serial Brigader',
    description: 'Achieved 10 salt points',
    tier: AchievementTier.SILVER,
    scoreThreshold: 10,
    imagePrompt:
      'A silver badge with an angry keyboard warrior silhouette, dramatic lighting, gaming achievement style',
    roastTemplate: 'Double digits! Your commitment to being upset is truly inspiring.',
  },
  {
    id: 'professional_hater',
    name: 'Professional Hater',
    description: 'Achieved 25 salt points',
    tier: AchievementTier.GOLD,
    scoreThreshold: 25,
    imagePrompt:
      'A gleaming gold medal with a rage face emoji, surrounded by salt crystals, epic gaming achievement',
    roastTemplate:
      'At this point, you should put this on your resume. Professional-grade salt mining.',
  },
  {
    id: 'legendary_salt_lord',
    name: 'Legendary Salt Lord',
    description: 'Achieved 50 salt points',
    tier: AchievementTier.PLATINUM,
    scoreThreshold: 50,
    imagePrompt:
      'A platinum crown made of crystallized salt, glowing with inner rage, legendary item style',
    roastTemplate:
      'You have achieved Salt Enlightenment. The Dead Sea is jealous of your sodium levels.',
  },
  {
    id: 'transcendent_malcontent',
    name: 'Transcendent Malcontent',
    description: 'Achieved 100 salt points',
    tier: AchievementTier.DIAMOND,
    scoreThreshold: 100,
    imagePrompt:
      'A diamond keyboard warrior statue ascending to the heavens, surrounded by pure crystalline rage, ultimate achievement',
    roastTemplate:
      'You have transcended mere mortal hatred. Scientists wish to study your salt glands.',
  },

  // ===== RANK ACHIEVEMENTS =====
  {
    id: 'top_ten_menace',
    name: 'Top 10 Menace',
    description: 'Entered the top 10 haters',
    tier: AchievementTier.SILVER,
    rankThreshold: 10,
    imagePrompt: 'A "Top 10" billboard with a troll face, neon lights, leaderboard style',
    roastTemplate: 'You cracked the top 10! Your parents must be so proud.',
  },
  {
    id: 'podium_pest',
    name: 'Podium Pest',
    description: 'Reached top 3 on the leaderboard',
    tier: AchievementTier.GOLD,
    rankThreshold: 3,
    imagePrompt:
      'A bronze/silver/gold podium with an angry gamer on top, victory pose, esports style',
    roastTemplate: 'Top 3! At this point you might as well go for gold. We believe in you.',
  },
  {
    id: 'supreme_antagonist',
    name: 'Supreme Antagonist',
    description: 'Became the #1 hater',
    tier: AchievementTier.DIAMOND,
    rankThreshold: 1,
    imagePrompt:
      'A massive golden throne made of salt crystals, with "SUPREME HATER" engraved, boss battle style',
    roastTemplate:
      'CONGRATULATIONS! You are now the #1 hater. The crown is heavy, but you carry it with such dedication.',
  },

  // ===== SPECIAL ACHIEVEMENTS =====
  {
    id: 'new_challenger',
    name: 'A New Challenger Appears!',
    description: 'First hostile link detected',
    tier: AchievementTier.BRONZE,
    special: 'first_offense',
    imagePrompt:
      'A "NEW CHALLENGER" arcade screen with a silhouette entering, street fighter style',
    roastTemplate:
      'Welcome! Your first contribution to our hater leaderboard has been recorded for posterity.',
  },
  {
    id: 'mask_off',
    name: 'Mask Off',
    description: 'Alt account linked to main',
    tier: AchievementTier.GOLD,
    special: 'alt_exposed',
    imagePrompt: 'A dramatic unmasking scene, Scooby-Doo reveal style, "It was YOU all along!"',
    roastTemplate:
      'Your alt has been linked! The sockpuppet theater has been exposed. Standing ovation.',
  },
  {
    id: 'broken_record',
    name: 'Broken Record',
    description: 'Repeated the same talking point 3+ times',
    tier: AchievementTier.BRONZE,
    special: 'meme_repeater',
    imagePrompt: 'A cracked vinyl record with "ECHO CHAMBER" written on it, retro style',
    roastTemplate: 'We get it. You have opinions. The same ones. Over and over.',
  },
  {
    id: 'consistency_award',
    name: 'Consistency Award',
    description: 'Hostile links 5 days in a row',
    tier: AchievementTier.SILVER,
    special: 'streak',
    imagePrompt: 'A calendar with fire emojis on 5 consecutive days, streak counter style',
    roastTemplate:
      'Five days straight! That kind of dedication usually goes to something productive.',
  },

  // ===== MEME-SPECIFIC ACHIEVEMENTS =====
  {
    id: 'echo_enthusiast',
    name: 'Echo Enthusiast',
    description: 'Used "echo chamber" or "hivemind" complaint',
    tier: AchievementTier.BRONZE,
    special: 'echo_chamber_user',
    imagePrompt: 'A cave with "ECHO ECHO ECHO" bouncing off walls, cartoon style',
    roastTemplate:
      'Ah yes, the classic "echo chamber" complaint. How original. How unique. How... echoing.',
  },
  {
    id: 'transplant_tracker',
    name: 'Transplant Tracker',
    description: 'Blamed transplants or Californians',
    tier: AchievementTier.BRONZE,
    special: 'transplant_blamer',
    imagePrompt: 'A plant being transplanted with an angry face, gardening gone wrong style',
    roastTemplate:
      'Blaming transplants - the timeless Seattle tradition older than the Space Needle.',
  },
  {
    id: 'mod_critic',
    name: 'Mod Critic',
    description: 'Accused mods of abuse or power-tripping',
    tier: AchievementTier.BRONZE,
    special: 'mod_accuser',
    imagePrompt: 'A tiny figure shaking fist at a giant moderator badge, David vs Goliath style',
    roastTemplate: 'The mods are out to get you specifically. You figured it out. Congratulations.',
  },
  {
    id: 'meme_collector',
    name: 'Meme Collector',
    description: 'Used 5 different talking points',
    tier: AchievementTier.SILVER,
    special: 'meme_collector',
    imagePrompt: 'A trophy case filled with different complaint memes, collector edition style',
    roastTemplate:
      'Five different complaints! A true connoisseur of grievances. Your collection is impressive.',
  },
  {
    id: 'meme_master',
    name: 'Meme Master',
    description: 'Used 10 different talking points',
    tier: AchievementTier.GOLD,
    special: 'meme_master',
    imagePrompt: 'A graduation cap made of Reddit memes, PhD in complaints style',
    roastTemplate:
      'TEN different talking points! You have achieved a PhD in Predictable Complaints.',
  },

  // ===== FAREWELL-SPECIFIC ACHIEVEMENTS =====
  {
    id: 'dramatic_departure',
    name: 'Dramatic Departure',
    description: 'Made a dramatic "I\'m leaving" announcement',
    tier: AchievementTier.BRONZE,
    special: 'dramatic_exit',
    imagePrompt: 'A person dramatically slamming a door with cape flowing, theatrical exit style',
    roastTemplate:
      'A dramatic exit! The stage is yours. The spotlight is on. The audience is... checking their phones.',
  },
  {
    id: 'encore_performer',
    name: 'Encore Performer',
    description: 'Announced leaving twice',
    tier: AchievementTier.SILVER,
    special: 'repeat_announcer',
    imagePrompt:
      'A performer taking multiple bows while audience looks confused, awkward encore style',
    roastTemplate:
      'Back for another farewell? The first goodbye was so good you had to do it again.',
  },
  {
    id: 'farewell_trilogy',
    name: 'The Farewell Trilogy',
    description: 'Announced leaving three or more times',
    tier: AchievementTier.GOLD,
    special: 'farewell_trilogy',
    imagePrompt: 'Three movie posters for "Goodbye Part 1, 2, 3" with increasingly dramatic poses',
    roastTemplate: 'THREE farewells! A trilogy! When is the spinoff series? The extended universe?',
  },
  {
    id: 'shadow_lurker',
    name: 'Shadow Lurker',
    description: 'Announced leaving with almost no prior activity',
    tier: AchievementTier.BRONZE,
    special: 'lurker_leaver',
    imagePrompt: 'A ninja emerging from shadows just to say goodbye, stealth farewell style',
    roastTemplate: 'You lurked for so long and THIS is your debut? A farewell? Bold strategy.',
  },

  // ===== BEHAVIOR-SPECIFIC ACHIEVEMENTS =====
  {
    id: 'rage_machine',
    name: 'Rage Machine',
    description: 'Consistently hostile tone detected',
    tier: AchievementTier.SILVER,
    special: 'hostile_tone',
    imagePrompt: 'A keyboard with smoke coming out of it, rage typing style',
    roastTemplate: 'Your hostility is consistent, we will give you that. Have you tried decaf?',
  },
  {
    id: 'multi_front_warrior',
    name: 'Multi-Front Warrior',
    description: 'Posted from 3+ hostile subreddits',
    tier: AchievementTier.SILVER,
    special: 'multi_sub_hater',
    imagePrompt: 'A warrior fighting on multiple fronts with Reddit logos, battle map style',
    roastTemplate: 'Fighting on multiple subreddit fronts! A true keyboard warrior crusade.',
  },
  {
    id: 'evidence_eraser',
    name: 'Evidence Eraser',
    description: 'Significant deleted content detected',
    tier: AchievementTier.GOLD,
    special: 'deleted_evidence',
    imagePrompt: 'A paper shredder eating Reddit posts, cover-up style',
    roastTemplate: 'Deleting your posts? The internet never forgets. Neither do we.',
  },
  {
    id: 'troll_suspect',
    name: 'Troll Suspect',
    description: 'High trolling likelihood detected by The-Profiler',
    tier: AchievementTier.SILVER,
    special: 'high_troll_risk',
    imagePrompt: 'A troll under a bridge holding a smartphone, modern troll style',
    roastTemplate:
      'Our behavioral analysis suggests... you might be doing this on purpose. Shocking.',
  },
  {
    id: 'story_teller',
    name: 'Story Teller',
    description: 'Deception indicators detected in posts',
    tier: AchievementTier.GOLD,
    special: 'deception_detected',
    imagePrompt: 'A Pinocchio nose growing from a Reddit avatar, caught lying style',
    roastTemplate: 'Inconsistencies detected! Your story has more holes than Swiss cheese.',
  },

  // ===== VILLAIN ACHIEVEMENTS (New) =====
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: '10+ hostile posts between 2-5am',
    tier: AchievementTier.SILVER,
    special: 'night_owl',
    imagePrompt: 'An owl with bloodshot eyes typing on a laptop at 3am, coffee cups everywhere, gaming achievement style',
    roastTemplate: 'Losing sleep to lose arguments. Your dedication to 3am rage-posting is noted.',
  },
  {
    id: 'speedrunner',
    name: 'Speedrunner',
    description: 'Reached 25 salt points in under 7 days',
    tier: AchievementTier.GOLD,
    special: 'speedrunner',
    imagePrompt: 'A speedrun timer with salt shakers, NEW PB flashing, retro gaming style',
    roastTemplate: 'Any% hater run, new personal best! Most people take months to get here.',
  },
  {
    id: 'comeback_king',
    name: 'Comeback King',
    description: 'Returned after 6+ month hiatus to hate',
    tier: AchievementTier.SILVER,
    special: 'comeback_king',
    imagePrompt: 'A phoenix rising from ashes but angry and holding a keyboard, dramatic style',
    roastTemplate: 'You can check out any time you like, but you can never leave. Welcome back!',
  },
  {
    id: 'delete_and_retreat',
    name: 'Delete & Retreat',
    description: 'Deleted comment within 5 minutes of posting',
    tier: AchievementTier.BRONZE,
    special: 'delete_and_retreat',
    imagePrompt: 'A trash can with a speech bubble being thrown away, regret style',
    roastTemplate: 'Typed, posted, immediately regretted. We saw it though.',
  },
  {
    id: 'wall_of_text',
    name: 'Wall of Text',
    description: 'Single complaint comment over 2000 characters',
    tier: AchievementTier.BRONZE,
    special: 'wall_of_text',
    imagePrompt: 'A giant wall made of text blocks crushing a tiny reader, epic style',
    roastTemplate: 'Sir, this is a Wendys. Nobody is reading all that.',
  },
  {
    id: 'double_down',
    name: 'Double Down',
    description: 'Continued arguing after being proven wrong',
    tier: AchievementTier.SILVER,
    special: 'double_down',
    imagePrompt: 'Two poker chips stacked on a losing hand, casino style',
    roastTemplate: 'Doubling down on a losing hand. Respect the commitment, question the judgment.',
  },
  {
    id: 'whataboutism',
    name: 'What About...',
    description: 'Used whataboutism deflection 3+ times',
    tier: AchievementTier.BRONZE,
    special: 'whataboutism',
    imagePrompt: 'A person pointing in multiple directions at once, confused deflection style',
    roastTemplate: 'Deflection skill: 100. Staying on topic: 0.',
  },
  {
    id: 'seattle_freeze',
    name: 'Seattle Freeze',
    description: 'Complained about Seattle friendliness',
    tier: AchievementTier.BRONZE,
    special: 'seattle_freeze',
    seattleSpecific: true,
    imagePrompt: 'A frozen coffee cup with a passive-aggressive sticky note, PNW style',
    roastTemplate: 'Making friends by complaining about how hard it is to make friends. Bold strategy.',
  },
  {
    id: 'rain_check',
    name: 'Rain Check',
    description: 'Complained about Seattle weather 5+ times',
    tier: AchievementTier.BRONZE,
    special: 'rain_check',
    seattleSpecific: true,
    imagePrompt: 'A rain cloud with an angry face following someone, cartoon style',
    roastTemplate: 'Did you... not know it rains here? This information was available.',
  },
  {
    id: 'rent_is_too_damn_high',
    name: 'The Rent Is Too Damn High',
    description: '10+ housing complaint posts',
    tier: AchievementTier.SILVER,
    special: 'rent_is_too_damn_high',
    imagePrompt: 'A person shaking fist at apartment building with dollar signs, meme style',
    roastTemplate: 'We know. We ALL know. You are not the first to notice.',
  },

  // ===== HERO ACHIEVEMENTS (New) =====
  {
    id: 'helpful_local',
    name: 'Helpful Local',
    description: '10+ comments helping tourists/visitors',
    tier: AchievementTier.BRONZE,
    special: 'helpful_local',
    imagePrompt: 'A friendly person with a map and coffee giving directions, wholesome style',
    roastTemplate: 'The hero every visitor needs! Your neighborhood knowledge is appreciated.',
  },
  {
    id: 'peacemaker',
    name: 'Peacemaker',
    description: 'De-escalated 3+ heated threads',
    tier: AchievementTier.SILVER,
    special: 'peacemaker',
    imagePrompt: 'A dove carrying an olive branch between two angry Reddit avatars, noble style',
    roastTemplate: 'Bringing civility to the discourse. The community salutes your patience.',
  },
  {
    id: 'fact_checker',
    name: 'Fact Checker',
    description: 'Provided sources in 5+ debates',
    tier: AchievementTier.SILVER,
    special: 'fact_checker',
    imagePrompt: 'A magnifying glass over citations with checkmarks, academic style',
    roastTemplate: 'Citations! Actual citations! You are doing the Lords work.',
  },
  {
    id: 'welcomer',
    name: 'Welcome Wagon',
    description: 'Welcomed 10+ new residents',
    tier: AchievementTier.BRONZE,
    special: 'welcomer',
    imagePrompt: 'A wagon full of coffee and umbrellas with a welcome banner, friendly style',
    roastTemplate: 'Making Seattle less freezy, one welcome at a time.',
  },
  {
    id: 'og_local',
    name: 'OG Local',
    description: 'Account 10+ years old, positive contributor',
    tier: AchievementTier.GOLD,
    special: 'og_local',
    imagePrompt: 'A vintage Seattle badge with Space Needle, established date, retro style',
    roastTemplate: 'Remember when this was all orchards? A true Seattle veteran.',
  },
  {
    id: 'event_evangelist',
    name: 'Event Evangelist',
    description: 'Shared 20+ local events',
    tier: AchievementTier.SILVER,
    special: 'event_evangelist',
    imagePrompt: 'A calendar exploding with fun activities, energetic style',
    roastTemplate: 'The social calendar we all need. Thanks for keeping us informed!',
  },
  {
    id: 'photo_pro',
    name: 'Photo Pro',
    description: '10+ upvoted Seattle photos',
    tier: AchievementTier.BRONZE,
    special: 'photo_pro',
    imagePrompt: 'A camera with Mount Rainier in the viewfinder, artistic style',
    roastTemplate: 'Making us all jealous of your views and photography skills.',
  },
  {
    id: 'good_faith_debater',
    name: 'Good Faith Debater',
    description: 'Changed mind publicly based on evidence',
    tier: AchievementTier.GOLD,
    special: 'good_faith_debater',
    imagePrompt: 'A lightbulb moment over someones head during a discussion, enlightened style',
    roastTemplate: 'Intellectual honesty is rare and beautiful. Respect.',
  },
  {
    id: 'hidden_gem_hunter',
    name: 'Hidden Gem Hunter',
    description: 'Shared 5+ underrated local spots',
    tier: AchievementTier.SILVER,
    special: 'hidden_gem_hunter',
    imagePrompt: 'A treasure map of Seattle with gem markers, adventure style',
    roastTemplate: 'Keeper of secret knowledge. The real MVP of local recommendations.',
  },

  // ===== CHAOTIC NEUTRAL ACHIEVEMENTS (New) =====
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    description: 'Only active on weekends',
    tier: AchievementTier.BRONZE,
    special: 'weekend_warrior',
    imagePrompt: 'A warrior helmet made of calendar pages showing Saturday/Sunday, fun style',
    roastTemplate: '9-5 lurker, weekend warrior. We see you.',
  },
  {
    id: 'one_topic_wonder',
    name: 'One Topic Wonder',
    description: '50+ posts about the same niche topic',
    tier: AchievementTier.SILVER,
    special: 'one_topic_wonder',
    imagePrompt: 'A person surrounded by the same thing repeated infinitely, obsession style',
    roastTemplate: 'Passion or obsession? Yes. At least you are consistent.',
  },
  {
    id: 'haiku_magnet',
    name: 'Haiku Magnet',
    description: 'Triggered haiku-sensei 5+ times',
    tier: AchievementTier.BRONZE,
    special: 'haiku_magnet',
    imagePrompt: 'A magnet attracting 5-7-5 syllable patterns, zen style',
    roastTemplate: 'Accidentally poetic. The bot loves you.',
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: '90% of posts before 7am',
    tier: AchievementTier.BRONZE,
    special: 'early_bird',
    imagePrompt: 'A bird with coffee posting on Reddit at sunrise, morning style',
    roastTemplate: 'Do you even sleep? Your commitment to early morning posting is noted.',
  },
  {
    id: 'lurker_emeritus',
    name: 'Lurker Emeritus',
    description: 'First post after 5+ years of account age',
    tier: AchievementTier.SILVER,
    special: 'lurker_emeritus',
    imagePrompt: 'A figure emerging from shadows after years of watching, dramatic reveal style',
    roastTemplate: 'They speak! After 5 years of silence, the lurker has emerged.',
  },
  {
    id: 'contrarian',
    name: 'Professional Contrarian',
    description: 'Disagreed with top comment 10+ times',
    tier: AchievementTier.BRONZE,
    special: 'contrarian',
    imagePrompt: 'A person saying well actually with glasses pushed up, debate style',
    roastTemplate: 'Well, actually... Your dedication to disagreement is impressive.',
  },
  {
    id: 'necromancer',
    name: 'Thread Necromancer',
    description: 'Commented on 3+ posts older than 6 months',
    tier: AchievementTier.BRONZE,
    special: 'necromancer',
    imagePrompt: 'A wizard raising old Reddit threads from graves, dark magic style',
    roastTemplate: 'Raising the dead, one ancient thread at a time.',
  },

  // ===== META ACHIEVEMENTS (New) =====
  {
    id: 'achievement_hunter',
    name: 'Achievement Hunter',
    description: 'Unlocked 10+ achievements',
    tier: AchievementTier.SILVER,
    special: 'achievement_hunter',
    imagePrompt: 'A trophy case full of achievement badges, collector style',
    roastTemplate: 'Playing the metagame. At this point you are doing it on purpose.',
  },
  {
    id: 'bot_whisperer',
    name: 'Bot Whisperer',
    description: 'Had conversation with bot 3+ times',
    tier: AchievementTier.BRONZE,
    special: 'bot_whisperer',
    imagePrompt: 'A person having tea with robot friends, wholesome tech style',
    roastTemplate: 'Making friends with the machines. They remember kindness.',
  },
  {
    id: 'hall_of_famer',
    name: 'Hall of Famer',
    description: 'Featured in Hall of Shame wiki',
    tier: AchievementTier.GOLD,
    special: 'hall_of_famer',
    imagePrompt: 'A golden frame with a portrait in a hall of infamous portraits, legendary style',
    roastTemplate: 'Legendary status achieved. Your name echoes in the halls.',
  },
  {
    id: 'self_aware',
    name: 'Self Aware',
    description: 'Acknowledged own achievement in comment',
    tier: AchievementTier.BRONZE,
    special: 'self_aware',
    imagePrompt: 'A person looking at their own reflection which is winking, meta style',
    roastTemplate: 'At least you are honest about it. Self-awareness is rare.',
  },
  {
    id: 'completionist',
    name: 'Completionist',
    description: 'Unlocked all Bronze tier achievements',
    tier: AchievementTier.PLATINUM,
    special: 'completionist',
    imagePrompt: 'A complete set of bronze badges arranged in a platinum frame, collector ultimate style',
    roastTemplate: 'Gotta catch em all! The dedication to complete the set is... something.',
  },

  // ===== SEATTLE-SPECIFIC ACHIEVEMENTS (New) =====
  {
    id: 'umbrella_truther',
    name: 'Umbrella Truther',
    description: 'Argued about umbrella usage',
    tier: AchievementTier.BRONZE,
    special: 'umbrella_truther',
    seattleSpecific: true,
    imagePrompt: 'A conspiracy board connecting umbrellas to Seattle identity, investigation style',
    roastTemplate: 'Real Seattleites dont... wait, do they? The eternal debate.',
  },
  {
    id: 'best_teriyaki',
    name: 'Best Teriyaki Debater',
    description: 'Argued about teriyaki spots',
    tier: AchievementTier.BRONZE,
    special: 'best_teriyaki',
    seattleSpecific: true,
    imagePrompt: 'A teriyaki bowl with a debate podium, food fight style',
    roastTemplate: 'The eternal question. Everyone has opinions on this.',
  },
  {
    id: 'mountain_out',
    name: 'The Mountain Is Out',
    description: 'Posted Rainier photo for karma',
    tier: AchievementTier.BRONZE,
    special: 'mountain_out',
    seattleSpecific: true,
    imagePrompt: 'Mount Rainier with upvote arrows raining down, majestic style',
    roastTemplate: 'But it never gets old. The mountain is indeed out.',
  },
  {
    id: 'transit_takes',
    name: 'Transit Takes',
    description: 'Strong opinions on light rail',
    tier: AchievementTier.BRONZE,
    special: 'transit_takes',
    seattleSpecific: true,
    imagePrompt: 'A light rail train with opinion bubbles all around it, urban planning style',
    roastTemplate: 'Everyones a transit planner. Your takes have been noted.',
  },
  {
    id: 'techie_blamer',
    name: 'Techie Blamer',
    description: 'Blamed tech workers for problems',
    tier: AchievementTier.SILVER,
    special: 'techie_blamer',
    seattleSpecific: true,
    imagePrompt: 'Tech company logos being blamed for everything, scapegoat style',
    roastTemplate: 'Its always Amazons fault somehow. Classic Seattle discourse.',
  },
  {
    id: 'old_seattle',
    name: 'Old Seattle Energy',
    description: 'Used back in my day 5+ times',
    tier: AchievementTier.SILVER,
    special: 'old_seattle',
    seattleSpecific: true,
    imagePrompt: 'A sepia-toned Seattle skyline with someone shaking fist at clouds, nostalgic style',
    roastTemplate: 'OK, Boomer... but also, valid. Seattle has changed a lot.',
  },
];

// Achievement tier colors (for display)
export const TIER_COLORS: Record<AchievementTier, string> = {
  [AchievementTier.BRONZE]: '#CD7F32',
  [AchievementTier.SILVER]: '#C0C0C0',
  [AchievementTier.GOLD]: '#FFD700',
  [AchievementTier.PLATINUM]: '#E5E4E2',
  [AchievementTier.DIAMOND]: '#B9F2FF',
};

// Achievement tier emojis
export const TIER_EMOJIS: Record<AchievementTier, string> = {
  [AchievementTier.BRONZE]: '🥉',
  [AchievementTier.SILVER]: '🥈',
  [AchievementTier.GOLD]: '🥇',
  [AchievementTier.PLATINUM]: '💎',
  [AchievementTier.DIAMOND]: '👑',
};

const ACHIEVEMENTS_WIKI_PAGE = 'hub-bot-9000/user-achievements';
const ACHIEVEMENT_COOLDOWN_HOURS = 24;

/**
 * Get a user's achievement record
 */
export async function getUserAchievements(
  context: AppContext,
  username: string
): Promise<UserAchievements | null> {
  const key = `${REDIS_PREFIX.brigade}achievements:${username.toLowerCase()}`;
  return getJson<UserAchievements>(context.redis, key);
}

/**
 * Save a user's achievement record
 */
async function saveUserAchievements(
  context: AppContext,
  achievements: UserAchievements
): Promise<void> {
  const key = `${REDIS_PREFIX.brigade}achievements:${achievements.username.toLowerCase()}`;
  await setJson(context.redis, key, achievements, 365 * 24 * 60 * 60); // 1 year TTL
}

/**
 * Check for newly unlocked achievements based on user stats
 */
export async function checkAchievements(
  context: AppContext,
  username: string,
  userEntry: UserHaterEntry,
  leaderboardData: LeaderboardData,
  options?: {
    isFirstOffense?: boolean;
    isAltExposed?: boolean;
    repeatedMemes?: string[];
    uniqueMemesUsed?: string[];
    consecutiveDays?: number;
    cooldownHours?: number;
    // Farewell-specific
    isDramaticExit?: boolean;
    farewellCount?: number;
    isLurkerLeaver?: boolean;
    // Behavior-specific
    isHostileTone?: boolean;
    homeSubCount?: number;
    deletedContentCount?: number;
    trollingRisk?: 'low' | 'moderate' | 'high';
    deceptionIndicators?: number;
    // Villain-specific (new)
    nightPostCount?: number;
    daysToReach25?: number;
    monthsSinceLastActivity?: number;
    quickDeleteCount?: number;
    longCommentLength?: number;
    doubleDownCount?: number;
    whataboutismCount?: number;
    seattleFreezeComplaint?: boolean;
    weatherComplaintCount?: number;
    housingComplaintCount?: number;
    // Hero-specific (new)
    helpfulCommentCount?: number;
    deescalationCount?: number;
    sourcedDebateCount?: number;
    welcomeCount?: number;
    accountAgeYears?: number;
    isPositiveContributor?: boolean;
    eventShareCount?: number;
    upvotedPhotoCount?: number;
    changedMindPublicly?: boolean;
    hiddenGemCount?: number;
    // Chaotic neutral (new)
    weekendOnlyPoster?: boolean;
    sameTopicCount?: number;
    haikuTriggerCount?: number;
    earlyBirdPercentage?: number;
    yearsBeforeFirstPost?: number;
    topCommentDisagreeCount?: number;
    oldThreadCommentCount?: number;
    // Meta (new)
    totalUnlockedAchievements?: number;
    botConversationCount?: number;
    inHallOfShame?: boolean;
    acknowledgedAchievement?: boolean;
    hasAllBronze?: boolean;
    // Seattle-specific (new)
    umbrellaArgument?: boolean;
    teriyakiArgument?: boolean;
    rainierPhotoPosted?: boolean;
    transitOpinion?: boolean;
    techBlameCount?: number;
    backInMyDayCount?: number;
  }
): Promise<AchievementUnlock[]> {
  const opts = options || {};
  const cooldownHours = opts.cooldownHours ?? ACHIEVEMENT_COOLDOWN_HOURS;

  // Get or create user achievements
  let userAchievements = await getUserAchievements(context, username);
  if (!userAchievements) {
    userAchievements = {
      username: username.toLowerCase(),
      unlockedAchievements: [],
      notifiedAchievements: [],
      lastAchievementAt: 0,
      lastNotificationAt: 0,
      totalAchievements: 0,
      highestTier: AchievementTier.BRONZE,
    };
  }

  // Calculate user's score and rank
  const score =
    userEntry.adversarialCount +
    userEntry.hatefulCount * 3 +
    userEntry.modLogSpamCount * 2 +
    (userEntry.flaggedContentCount || 0) * 2;

  const userRank =
    leaderboardData.topUsers.findIndex((u) => u.username.toLowerCase() === username.toLowerCase()) +
    1; // 1-indexed, 0 means not in top 10

  const unlocks: AchievementUnlock[] = [];

  // Check each achievement
  for (const achievement of ACHIEVEMENTS) {
    const alreadyUnlocked = userAchievements.unlockedAchievements.includes(achievement.id);
    const alreadyNotified = userAchievements.notifiedAchievements.includes(achievement.id);

    let meetsCondition = false;

    // Score threshold
    if (achievement.scoreThreshold && score >= achievement.scoreThreshold) {
      meetsCondition = true;
    }

    // Rank threshold
    if (achievement.rankThreshold && userRank > 0 && userRank <= achievement.rankThreshold) {
      meetsCondition = true;
    }

    // Special conditions
    if (achievement.special) {
      switch (achievement.special) {
        case 'first_offense':
          meetsCondition = opts.isFirstOffense === true;
          break;
        case 'alt_exposed':
          meetsCondition = opts.isAltExposed === true;
          break;
        case 'meme_repeater':
          meetsCondition = (opts.repeatedMemes?.length || 0) >= 3;
          break;
        case 'streak':
          meetsCondition = (opts.consecutiveDays || 0) >= 5;
          break;

        // Meme-specific
        case 'echo_chamber_user':
          meetsCondition =
            opts.repeatedMemes?.includes('echo_chamber') ||
            opts.uniqueMemesUsed?.includes('echo_chamber') ||
            false;
          break;
        case 'transplant_blamer':
          meetsCondition =
            opts.repeatedMemes?.includes('transplants') ||
            opts.uniqueMemesUsed?.includes('transplants') ||
            false;
          break;
        case 'mod_accuser':
          meetsCondition =
            opts.repeatedMemes?.includes('mod_abuse') ||
            opts.uniqueMemesUsed?.includes('mod_abuse') ||
            false;
          break;
        case 'meme_collector':
          meetsCondition = (opts.uniqueMemesUsed?.length || 0) >= 5;
          break;
        case 'meme_master':
          meetsCondition = (opts.uniqueMemesUsed?.length || 0) >= 10;
          break;

        // Farewell-specific
        case 'dramatic_exit':
          meetsCondition = opts.isDramaticExit === true;
          break;
        case 'repeat_announcer':
          meetsCondition = (opts.farewellCount || 0) >= 2;
          break;
        case 'farewell_trilogy':
          meetsCondition = (opts.farewellCount || 0) >= 3;
          break;
        case 'lurker_leaver':
          meetsCondition = opts.isLurkerLeaver === true;
          break;

        // Behavior-specific
        case 'hostile_tone':
          meetsCondition = opts.isHostileTone === true;
          break;
        case 'multi_sub_hater':
          meetsCondition = (opts.homeSubCount || userEntry.homeSubreddits?.length || 0) >= 3;
          break;
        case 'deleted_evidence':
          meetsCondition = (opts.deletedContentCount || userEntry.flaggedContentCount || 0) >= 5;
          break;
        case 'high_troll_risk':
          meetsCondition =
            opts.trollingRisk === 'high' ||
            userEntry.behavioralProfile?.moderationRisk?.trollingLikelihood === 'high';
          break;
        case 'deception_detected':
          meetsCondition =
            (opts.deceptionIndicators || 0) >= 2 ||
            (userEntry.behavioralProfile?.moderationRisk?.deceptionIndicators || 0) >= 2;
          break;

        // Villain achievements (new)
        case 'night_owl':
          meetsCondition = (opts.nightPostCount || 0) >= 10;
          break;
        case 'speedrunner':
          meetsCondition = score >= 25 && (opts.daysToReach25 || 999) <= 7;
          break;
        case 'comeback_king':
          meetsCondition = (opts.monthsSinceLastActivity || 0) >= 6;
          break;
        case 'delete_and_retreat':
          meetsCondition = (opts.quickDeleteCount || 0) >= 1;
          break;
        case 'wall_of_text':
          meetsCondition = (opts.longCommentLength || 0) >= 2000;
          break;
        case 'double_down':
          meetsCondition = (opts.doubleDownCount || 0) >= 1;
          break;
        case 'whataboutism':
          meetsCondition = (opts.whataboutismCount || 0) >= 3;
          break;
        case 'seattle_freeze':
          meetsCondition = opts.seattleFreezeComplaint === true;
          break;
        case 'rain_check':
          meetsCondition = (opts.weatherComplaintCount || 0) >= 5;
          break;
        case 'rent_is_too_damn_high':
          meetsCondition = (opts.housingComplaintCount || 0) >= 10;
          break;

        // Hero achievements (new)
        case 'helpful_local':
          meetsCondition = (opts.helpfulCommentCount || 0) >= 10;
          break;
        case 'peacemaker':
          meetsCondition = (opts.deescalationCount || 0) >= 3;
          break;
        case 'fact_checker':
          meetsCondition = (opts.sourcedDebateCount || 0) >= 5;
          break;
        case 'welcomer':
          meetsCondition = (opts.welcomeCount || 0) >= 10;
          break;
        case 'og_local':
          meetsCondition = (opts.accountAgeYears || 0) >= 10 && opts.isPositiveContributor === true;
          break;
        case 'event_evangelist':
          meetsCondition = (opts.eventShareCount || 0) >= 20;
          break;
        case 'photo_pro':
          meetsCondition = (opts.upvotedPhotoCount || 0) >= 10;
          break;
        case 'good_faith_debater':
          meetsCondition = opts.changedMindPublicly === true;
          break;
        case 'hidden_gem_hunter':
          meetsCondition = (opts.hiddenGemCount || 0) >= 5;
          break;

        // Chaotic neutral achievements (new)
        case 'weekend_warrior':
          meetsCondition = opts.weekendOnlyPoster === true;
          break;
        case 'one_topic_wonder':
          meetsCondition = (opts.sameTopicCount || 0) >= 50;
          break;
        case 'haiku_magnet':
          meetsCondition = (opts.haikuTriggerCount || 0) >= 5;
          break;
        case 'early_bird':
          meetsCondition = (opts.earlyBirdPercentage || 0) >= 90;
          break;
        case 'lurker_emeritus':
          meetsCondition = (opts.yearsBeforeFirstPost || 0) >= 5;
          break;
        case 'contrarian':
          meetsCondition = (opts.topCommentDisagreeCount || 0) >= 10;
          break;
        case 'necromancer':
          meetsCondition = (opts.oldThreadCommentCount || 0) >= 3;
          break;

        // Meta achievements (new)
        case 'achievement_hunter':
          meetsCondition = (opts.totalUnlockedAchievements || userAchievements.totalAchievements || 0) >= 10;
          break;
        case 'bot_whisperer':
          meetsCondition = (opts.botConversationCount || 0) >= 3;
          break;
        case 'hall_of_famer':
          meetsCondition = opts.inHallOfShame === true;
          break;
        case 'self_aware':
          meetsCondition = opts.acknowledgedAchievement === true;
          break;
        case 'completionist':
          meetsCondition = opts.hasAllBronze === true;
          break;

        // Seattle-specific achievements (new)
        case 'umbrella_truther':
          meetsCondition = opts.umbrellaArgument === true;
          break;
        case 'best_teriyaki':
          meetsCondition = opts.teriyakiArgument === true;
          break;
        case 'mountain_out':
          meetsCondition = opts.rainierPhotoPosted === true;
          break;
        case 'transit_takes':
          meetsCondition = opts.transitOpinion === true;
          break;
        case 'techie_blamer':
          meetsCondition = (opts.techBlameCount || 0) >= 3;
          break;
        case 'old_seattle':
          meetsCondition = (opts.backInMyDayCount || 0) >= 5;
          break;
      }
    }

    if (meetsCondition) {
      const isNew = !alreadyUnlocked;

      // Check cooldown for notifications
      const now = Date.now();
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const canNotify = !alreadyNotified || now - userAchievements.lastNotificationAt > cooldownMs;

      unlocks.push({
        achievement,
        isNew,
        shouldNotify: isNew && canNotify, // Only notify for new achievements, respecting cooldown
        leaderboardPosition: userRank || 999,
      });

      // Mark as unlocked
      if (isNew) {
        userAchievements.unlockedAchievements.push(achievement.id);
        userAchievements.lastAchievementAt = now;
        userAchievements.totalAchievements++;

        // Update highest tier
        if (getTierRank(achievement.tier) > getTierRank(userAchievements.highestTier)) {
          userAchievements.highestTier = achievement.tier;
        }
      }
    }
  }

  // Save if any changes
  if (unlocks.some((u) => u.isNew)) {
    await saveUserAchievements(context, userAchievements);
  }

  return unlocks;
}

/**
 * Mark an achievement as notified (after posting comment)
 */
export async function markAchievementNotified(
  context: AppContext,
  username: string,
  achievementId: string
): Promise<void> {
  const achievements = await getUserAchievements(context, username);
  if (!achievements) return;

  if (!achievements.notifiedAchievements.includes(achievementId)) {
    achievements.notifiedAchievements.push(achievementId);
  }
  achievements.lastNotificationAt = Date.now();

  await saveUserAchievements(context, achievements);
}

/**
 * Get achievement by ID
 */
export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/**
 * Get all achievements for a tier
 */
export function getAchievementsByTier(tier: AchievementTier): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.tier === tier);
}

/**
 * Get tier rank (for comparison)
 */
function getTierRank(tier: AchievementTier): number {
  const ranks: Record<AchievementTier, number> = {
    [AchievementTier.BRONZE]: 1,
    [AchievementTier.SILVER]: 2,
    [AchievementTier.GOLD]: 3,
    [AchievementTier.PLATINUM]: 4,
    [AchievementTier.DIAMOND]: 5,
  };
  return ranks[tier];
}

/**
 * Format achievement for display
 */
export function formatAchievementComment(
  achievement: Achievement,
  username: string,
  leaderboardPosition: number,
  totalScore: number,
  roastText: string,
  imageUrl?: string,
  wikiLinks?: Array<{ text: string; url: string }>
): string {
  const tierEmoji = TIER_EMOJIS[achievement.tier];
  const tierName = achievement.tier.toUpperCase();

  let comment = `## ${tierEmoji} ACHIEVEMENT UNLOCKED: ${achievement.name}

**${tierName} TIER**

${roastText}

---

**Current Stats:**
- Leaderboard Position: ${leaderboardPosition > 0 ? `#${leaderboardPosition}` : 'Unranked'}
- Total Salt Points: ${totalScore}
`;

  // Add image if provided (inline for subreddits that support it)
  if (imageUrl) {
    comment += `\n![${achievement.name}](${imageUrl})\n`;
  }

  // Add wiki links if provided
  if (wikiLinks && wikiLinks.length > 0) {
    comment += `\n**For your reference:**\n`;
    wikiLinks.forEach((link) => {
      comment += `- [${link.text}](${link.url})\n`;
    });
  }

  comment += `\n---\n*brigade-sentinel | hater-leaderboard | ${achievement.id}*`;

  return comment;
}

/**
 * Get the highest unnotified achievement for a user
 * (To avoid spamming with multiple achievements at once)
 */
export function getHighestNewAchievement(unlocks: AchievementUnlock[]): AchievementUnlock | null {
  const notifiable = unlocks.filter((u) => u.shouldNotify);
  if (notifiable.length === 0) return null;

  // Sort by tier rank (highest first)
  notifiable.sort((a, b) => getTierRank(b.achievement.tier) - getTierRank(a.achievement.tier));

  return notifiable[0];
}
