# Achievement Inventory

This document is the **single source of truth** for the Hub Bot 9000 achievement system. All achievements must be defined here first, then implemented in code with matching assets.

## Want to Add an Achievement? Please Do!

We actively encourage contributors to add new achievements! The system is designed to be **playfully irreverent** - think Xbox achievements meets r/RoastMe. Good achievements should:

- **Be amusing** - The name and roast should make people chuckle (or groan)
- **Celebrate absurdity** - Both heroic contributions AND spectacular failures deserve recognition
- **Stay lighthearted** - Satirical, not cruel. We're poking fun, not bullying.
- **Reference local culture** - Seattle-specific jokes are bonus points

### Achievement Flavors

| Type | Vibe | Examples |
|------|------|----------|
| **Villain Achievements** | "Congratulations, you played yourself" | Hater milestones, farewell drama, repeated complaints |
| **Hero Achievements** | "Genuine community MVP" | Helpful contributors, quality content creators |
| **Chaotic Neutral** | "This is weird but we respect it" | Unusual posting patterns, niche obsessions |
| **Meta Achievements** | "You found the Easter egg" | Bot interactions, achievement hunting |

**Don't be shy!** If you have an idea for an achievement - positive OR negative - add it to the "Future Achievement Ideas" section below or submit a PR with the full implementation.

## Quick Reference

| Count | Tier |
|-------|------|
| 8 | Bronze |
| 8 | Silver |
| 7 | Gold |
| 1 | Platinum |
| 2 | Diamond |
| **26** | **Total** |

## Achievement Registry

### Tier: Bronze (Participation)

| ID | Name | Unlock Condition | Asset |
|----|------|------------------|-------|
| `casual_complainer` | Casual Complainer | 5+ salt points | `casual_complainer.svg` |
| `new_challenger` | A New Challenger Appears! | First hostile link detected | `new_challenger.svg` |
| `broken_record` | Broken Record | Repeated same talking point 3+ times | `broken_record.svg` |
| `echo_enthusiast` | Echo Enthusiast | Used "echo chamber" or "hivemind" | `echo_enthusiast.svg` |
| `transplant_tracker` | Transplant Tracker | Blamed transplants/Californians | `transplant_tracker.svg` |
| `mod_critic` | Mod Critic | Accused mods of abuse/power-tripping | `mod_critic.svg` |
| `dramatic_departure` | Dramatic Departure | Made dramatic "I'm leaving" post | `dramatic_departure.svg` |
| `shadow_lurker` | Shadow Lurker | Announced leaving with almost no prior activity | `shadow_lurker.svg` |

### Tier: Silver (Commitment)

| ID | Name | Unlock Condition | Asset |
|----|------|------------------|-------|
| `serial_brigader` | Serial Brigader | 10+ salt points | `serial_brigader.svg` |
| `top_ten_menace` | Top 10 Menace | Entered top 10 on leaderboard | `top_ten_menace.svg` |
| `consistency_award` | Consistency Award | Hostile links 5 days in a row | `consistency_award.svg` |
| `meme_collector` | Meme Collector | Used 5 different talking points | `meme_collector.svg` |
| `encore_performer` | Encore Performer | Announced leaving twice | `encore_performer.svg` |
| `rage_machine` | Rage Machine | Consistently hostile tone detected | `rage_machine.svg` |
| `multi_front_warrior` | Multi-Front Warrior | Posted from 3+ hostile subreddits | `multi_front_warrior.svg` |
| `troll_suspect` | Troll Suspect | High trolling likelihood detected | `troll_suspect.svg` |

### Tier: Gold (Dedication)

| ID | Name | Unlock Condition | Asset |
|----|------|------------------|-------|
| `professional_hater` | Professional Hater | 25+ salt points | `professional_hater.svg` |
| `podium_pest` | Podium Pest | Reached top 3 on leaderboard | `podium_pest.svg` |
| `mask_off` | Mask Off | Alt account linked to main | `mask_off.svg` |
| `meme_master` | Meme Master | Used 10 different talking points | `meme_master.svg` |
| `farewell_trilogy` | The Farewell Trilogy | Announced leaving 3+ times | `farewell_trilogy.svg` |
| `evidence_eraser` | Evidence Eraser | 5+ deleted comments detected | `evidence_eraser.svg` |
| `story_teller` | Story Teller | Deception indicators detected | `story_teller.svg` |

### Tier: Platinum (Excellence)

| ID | Name | Unlock Condition | Asset |
|----|------|------------------|-------|
| `legendary_salt_lord` | Legendary Salt Lord | 50+ salt points | `legendary_salt_lord.svg` |

### Tier: Diamond (Supreme)

| ID | Name | Unlock Condition | Asset |
|----|------|------------------|-------|
| `transcendent_malcontent` | Transcendent Malcontent | 100+ salt points | `transcendent_malcontent.svg` |
| `supreme_antagonist` | Supreme Antagonist | #1 on the leaderboard | `supreme_antagonist.svg` |

---

## File Locations

| Type | Path |
|------|------|
| **Achievement definitions** | `packages/common/src/achievements.ts` |
| **Roast generation** | `packages/common/src/achievement-roast.ts` |
| **SVG assets** | `assets/achievements/general/{id}.svg` |
| **Redis storage** | `brigade:achievements:{username}` |

---

## Data Structures

### Achievement Definition (in code)

```typescript
interface Achievement {
  id: string;                    // Unique ID, matches asset filename
  name: string;                  // Display name
  description: string;           // Short description
  tier: AchievementTier;         // bronze | silver | gold | platinum | diamond
  scoreThreshold?: number;       // Min salt points to unlock
  rankThreshold?: number;        // Min rank (1 = first place)
  special?: string;              // Special unlock condition key
  imagePrompt: string;           // For AI image generation
  roastTemplate: string;         // Base roast text for AI enhancement
}
```

### User Achievement Record (in Redis)

```typescript
interface UserAchievements {
  username: string;
  unlockedAchievements: string[];   // Achievement IDs earned
  notifiedAchievements: string[];   // Already commented on (won't repeat)
  lastAchievementAt: number;        // Timestamp of last unlock
  lastNotificationAt: number;       // Timestamp of last comment
  totalAchievements: number;        // Count
  highestTier: AchievementTier;     // Best tier earned
}
```

---

## Unlock Condition Types

### Score-Based
Unlocks when user's salt points reach threshold.

```typescript
{ scoreThreshold: 25 }  // Unlocks at 25+ points
```

**Salt Point Formula:**
```
score = adversarialCount
      + (hatefulCount * 3)
      + (modLogSpamCount * 2)
      + (flaggedContentCount * 2)
```

### Rank-Based
Unlocks when user reaches leaderboard position.

```typescript
{ rankThreshold: 10 }  // Unlocks when in top 10
{ rankThreshold: 1 }   // Unlocks when #1
```

### Special Conditions
Unlocks based on specific behavior flags.

| Key | Trigger | Used By |
|-----|---------|---------|
| `first_offense` | `isFirstOffense: true` | new_challenger |
| `alt_exposed` | `isAltExposed: true` | mask_off |
| `meme_repeater` | `repeatedMemes.length >= 3` | broken_record |
| `streak` | `consecutiveDays >= 5` | consistency_award |
| `echo_chamber_user` | meme detected | echo_enthusiast |
| `transplant_blamer` | meme detected | transplant_tracker |
| `mod_accuser` | meme detected | mod_critic |
| `meme_collector` | `uniqueMemesUsed.length >= 5` | meme_collector |
| `meme_master` | `uniqueMemesUsed.length >= 10` | meme_master |
| `dramatic_exit` | `isDramaticExit: true` | dramatic_departure |
| `repeat_announcer` | `farewellCount >= 2` | encore_performer |
| `farewell_trilogy` | `farewellCount >= 3` | farewell_trilogy |
| `lurker_leaver` | `isLurkerLeaver: true` | shadow_lurker |
| `hostile_tone` | `isHostileTone: true` | rage_machine |
| `multi_sub_hater` | `homeSubCount >= 3` | multi_front_warrior |
| `deleted_evidence` | `deletedContentCount >= 5` | evidence_eraser |
| `high_troll_risk` | `trollingRisk === 'high'` | troll_suspect |
| `deception_detected` | `deceptionIndicators >= 2` | story_teller |

---

## How Notifications Work

1. **checkAchievements()** evaluates all 26 achievements against user stats
2. Returns `AchievementUnlock[]` with `isNew` and `shouldNotify` flags
3. `shouldNotify = isNew && !alreadyNotified && cooldownPassed`
4. **getHighestNewAchievement()** picks the best one (highest tier)
5. Scheduler job posts comment after delay (5+ minutes)
6. **markAchievementNotified()** adds to `notifiedAchievements[]`
7. Future checks return `shouldNotify: false` for that achievement

**Cooldown:** 24 hours between achievement comments for same user (configurable).

---

## Adding a New Achievement

### Checklist

- [ ] 1. Add entry to this document (ACHIEVEMENTS.md)
- [ ] 2. Add definition to `packages/common/src/achievements.ts`
- [ ] 3. Create SVG asset at `assets/achievements/general/{id}.svg`
- [ ] 4. If special condition, add case to `checkAchievements()` switch
- [ ] 5. Run validation: `npm run validate:achievements`
- [ ] 6. Update tier counts in this document

### Step 1: Document the Achievement

Add a row to the appropriate tier table above:

```markdown
| `my_new_achievement` | My New Achievement | Description of unlock | `my_new_achievement.svg` |
```

### Step 2: Add Code Definition

In `packages/common/src/achievements.ts`, add to `ACHIEVEMENTS` array:

```typescript
{
  id: 'my_new_achievement',
  name: 'My New Achievement',
  description: 'Unlocked when X happens',
  tier: AchievementTier.SILVER,
  special: 'my_special_condition',  // or scoreThreshold/rankThreshold
  imagePrompt: 'Description for AI image generation',
  roastTemplate: 'Base roast text that AI will personalize.',
},
```

### Step 3: Create SVG Asset

Create `assets/achievements/general/my_new_achievement.svg`:
- Size: 64x64 pixels recommended
- Style: Match existing achievement icons
- Naming: Must exactly match the `id` field

### Step 4: Add Special Condition (if needed)

If using a `special` unlock, add the condition key to the interface:

```typescript
// In Achievement interface, add to special union type:
special?:
  | 'first_offense'
  | 'my_special_condition'  // Add new key
  // ... etc
```

Then add the case in `checkAchievements()`:

```typescript
case 'my_special_condition':
  meetsCondition = opts.mySpecialFlag === true;
  break;
```

### Step 5: Validate

Run the validation script to ensure consistency:

```bash
npm run validate:achievements
```

This checks:
- Every achievement in code has a matching SVG asset
- Every SVG asset has a matching code definition
- This document matches the code

---

## Validation Script

Location: `scripts/validate-achievements.js`

```bash
npm run validate:achievements
```

Checks:
1. All IDs in `ACHIEVEMENTS` array have matching `.svg` files
2. All `.svg` files have matching entries in `ACHIEVEMENTS`
3. No duplicate IDs
4. All required fields present
5. Tier counts match this document

---

## Asset Guidelines

### SVG Specifications
- **Size:** 64x64 pixels
- **Format:** SVG (vector)
- **Naming:** `{achievement_id}.svg` (snake_case)
- **Style:** Consistent with existing icons

### Image Prompt Guidelines
For AI image generation, the `imagePrompt` should:
- Describe visual elements clearly
- Include style hints (e.g., "pixel art", "gaming achievement style")
- Be 1-2 sentences max

### Roast Template Guidelines
The `roastTemplate` is the base text that Gemini enhances:
- Keep it 1-2 sentences
- Include the core joke/roast concept
- AI will personalize based on user's behavior

**Writing Good Roasts:**
- **Punch up, not down** - Mock the behavior, not the person
- **Self-deprecating angle** - "We've all been there" energy works well
- **Pop culture references** - Gaming, memes, movies all fair game
- **Seattle-specific** - Local references get bonus laughs
- **Backhanded compliments** - "Your dedication is... impressive?"

**Examples of Good Roasts:**
- "Your commitment to being wrong is honestly inspiring"
- "Speedrunning the hater leaderboard, any% category"
- "The energy you put into this could power a small city"
- "We're not mad, just disappointed. Actually, we're a little impressed."

**For Positive Achievements:**
- Keep it genuinely warm but still witty
- "Finally, someone who read the sidebar"
- "Proof that heroes walk among us"
- "The community thanks you (and so does our blood pressure)"

---

## Tier Progression

```
Bronze (8)  ->  Silver (8)  ->  Gold (6)  ->  Platinum (1)  ->  Diamond (2)
   5 pts         10 pts         25 pts         50 pts          100 pts
```

### XP Values (for leaderboard bonus)
| Tier | XP Bonus |
|------|----------|
| Bronze | +2 |
| Silver | +5 |
| Gold | +10 |
| Platinum | +20 |
| Diamond | +50 |

---

## Future Achievement Ideas

**Add your ideas here!** These are achievements we'd love to see implemented. Feel free to add rows or submit PRs.

### Villain Achievements (Hater Recognition)

| ID | Name | Condition | Tier | Roast Idea |
|----|------|-----------|------|------------|
| `night_owl` | Night Owl | 10+ hostile posts between 2-5am | Silver | "Losing sleep to lose arguments" |
| `speedrunner` | Speedrunner | Reached 25 points in under 7 days | Gold | "Any% hater run, new PB!" |
| `comeback_king` | Comeback King | Returned after 6+ month hiatus to hate | Silver | "You can check out but you can never leave" |
| `delete_and_retreat` | Delete & Retreat | Deleted comment within 5 min of posting | Bronze | "Typed, posted, regretted" |
| `wall_of_text` | Wall of Text | Single comment over 2000 characters complaining | Bronze | "Sir, this is a Wendy's" |
| `double_down` | Double Down | Argued after being proven wrong | Silver | "Doubling down on a losing hand" |
| `whataboutism` | What About... | Used whataboutism 3+ times | Bronze | "Deflection: 100" |
| `seattle_freeze` | Seattle Freeze | Complained about friendliness | Bronze | "Making friends by complaining about making friends" |
| `rain_check` | Rain Check | Complained about weather 5+ times | Bronze | "Did you... not know it rains here?" |
| `rent_is_too_damn_high` | The Rent Is Too Damn High | 10+ housing complaint posts | Silver | "We know. We ALL know." |

### Hero Achievements (Positive Recognition)

| ID | Name | Condition | Tier | Praise Idea |
|----|------|-----------|------|-------------|
| `helpful_local` | Helpful Local | 10+ comments answering tourist questions | Bronze | "The hero every visitor needs" |
| `peacemaker` | Peacemaker | De-escalated 3+ heated threads | Silver | "Bringing civility to the discourse" |
| `fact_checker` | Fact Checker | Provided sources in 5+ debates | Silver | "Citations! Actual citations!" |
| `welcomer` | Welcome Wagon | Welcomed 10+ new residents | Bronze | "Making Seattle less freezy" |
| `og_local` | OG Local | Account 10+ years, positive contributor | Gold | "Remember when this was all orchards?" |
| `event_evangelist` | Event Evangelist | Shared 20+ local events | Silver | "The social calendar we need" |
| `photo_pro` | Photo Pro | 10+ upvoted Seattle photos | Bronze | "Making us all jealous of your views" |
| `good_faith_debater` | Good Faith Debater | Changed mind publicly based on evidence | Gold | "Intellectual honesty is rare and beautiful" |
| `hidden_gem_hunter` | Hidden Gem Hunter | Shared 5+ underrated local spots | Silver | "Keeper of secret knowledge" |

### Chaotic Neutral Achievements

| ID | Name | Condition | Tier | Comment Idea |
|----|------|-----------|------|--------------|
| `weekend_warrior` | Weekend Warrior | Only posts on weekends | Bronze | "9-5 lurker, weekend warrior" |
| `one_topic_wonder` | One Topic Wonder | 50+ posts about same niche topic | Silver | "Passion or obsession? Yes." |
| `haiku_magnet` | Haiku Magnet | Triggered haiku-sensei 5+ times | Bronze | "Accidentally poetic" |
| `early_bird` | Early Bird | 90% of posts before 7am | Bronze | "Do you even sleep?" |
| `lurker_emeritus` | Lurker Emeritus | First post after 5+ years of account age | Silver | "They speak!" |
| `contrarian` | Professional Contrarian | Disagreed with top comment 10+ times | Bronze | "Well, actually..." |
| `necromancer` | Thread Necromancer | Commented on 3+ posts older than 6 months | Bronze | "Raising the dead, one thread at a time" |

### Meta Achievements

| ID | Name | Condition | Tier | Comment Idea |
|----|------|-----------|------|--------------|
| `achievement_hunter` | Achievement Hunter | Unlocked 10+ achievements | Silver | "Playing the metagame" |
| `bot_whisperer` | Bot Whisperer | Had conversation with bot 3+ times | Bronze | "Making friends with the machines" |
| `hall_of_famer` | Hall of Famer | Featured in Hall of Shame wiki | Gold | "Legendary status achieved" |
| `self_aware` | Self Aware | Acknowledged own achievement in comment | Bronze | "At least you're honest about it" |
| `completionist` | Completionist | Unlocked all Bronze tier achievements | Platinum | "Gotta catch 'em all" |

### Seattle-Specific Ideas

| ID | Name | Condition | Tier | Comment Idea |
|----|------|-----------|------|--------------|
| `umbrella_truther` | Umbrella Truther | Argued about umbrella usage | Bronze | "Real Seattleites don't... wait" |
| `best_teriyaki` | Best Teriyaki Debater | Argued about teriyaki spots | Bronze | "The eternal question" |
| `mountain_out` | The Mountain Is Out | Posted Rainier photo for karma | Bronze | "But it never gets old" |
| `transit_takes` | Transit Takes | Strong opinions on light rail | Bronze | "Everyone's a transit planner" |
| `techie_blamer` | Techie Blamer | Blamed tech workers for everything | Silver | "It's always Amazon's fault somehow" |
| `old_seattle` | Old Seattle Energy | "Back in my day..." 5+ times | Silver | "OK, Boomer... but also, valid" |

---

## Contributing

Found a bug? Have an idea? Here's how to contribute:

1. **Just an idea?** Add it to the "Future Achievement Ideas" tables above
2. **Ready to implement?** Follow the checklist in "Adding a New Achievement"
3. **Questions?** Open an issue or ask in Discord

Remember: The best achievements are the ones that make people laugh when they unlock them - whether they're being roasted or praised.

---

## Changelog

| Date | Change |
|------|--------|
| 2024-12-29 | Initial 26 achievements implemented |
| 2025-01-11 | Created formal inventory document |
| 2025-01-11 | Added contributor guidance and expanded future ideas |
