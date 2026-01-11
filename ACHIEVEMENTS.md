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
| 27 | Bronze |
| 21 | Silver |
| 11 | Gold |
| 2 | Platinum |
| 2 | Diamond |
| **63** | **Total** |

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
| `delete_and_retreat` | Delete & Retreat | Deleted comment within 5 min | `delete_and_retreat.svg` |
| `wall_of_text` | Wall of Text | Single comment over 2000 characters | `wall_of_text.svg` |
| `whataboutism` | What About... | Used whataboutism 3+ times | `whataboutism.svg` |
| `seattle_freeze` | Seattle Freeze | Complained about friendliness | `seattle_freeze.svg` | Seattle |
| `rain_check` | Rain Check | Complained about weather 5+ times | `rain_check.svg` | Seattle |
| `helpful_local` | Helpful Local | 10+ helpful tourist comments | `helpful_local.svg` |
| `welcomer` | Welcome Wagon | Welcomed 10+ new residents | `welcomer.svg` |
| `photo_pro` | Photo Pro | 10+ upvoted photos | `photo_pro.svg` |
| `weekend_warrior` | Weekend Warrior | Only active on weekends | `weekend_warrior.svg` |
| `haiku_magnet` | Haiku Magnet | Triggered haiku-sensei 5+ times | `haiku_magnet.svg` |
| `early_bird` | Early Bird | 90% of posts before 7am | `early_bird.svg` |
| `contrarian` | Professional Contrarian | Disagreed with top comment 10+ times | `contrarian.svg` |
| `necromancer` | Thread Necromancer | Commented on 3+ old posts | `necromancer.svg` |
| `bot_whisperer` | Bot Whisperer | Bot conversation 3+ times | `bot_whisperer.svg` |
| `self_aware` | Self Aware | Acknowledged own achievement | `self_aware.svg` |
| `umbrella_truther` | Umbrella Truther | Argued about umbrella usage | `umbrella_truther.svg` | Seattle |
| `best_teriyaki` | Best Teriyaki Debater | Argued about teriyaki spots | `best_teriyaki.svg` | Seattle |
| `mountain_out` | The Mountain Is Out | Posted Rainier photo | `mountain_out.svg` | Seattle |
| `transit_takes` | Transit Takes | Strong opinions on light rail | `transit_takes.svg` | Seattle |

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
| `night_owl` | Night Owl | 10+ hostile posts 2-5am | `night_owl.svg` |
| `comeback_king` | Comeback King | Returned after 6+ month hiatus | `comeback_king.svg` |
| `double_down` | Double Down | Argued after being proven wrong | `double_down.svg` |
| `rent_is_too_damn_high` | The Rent Is Too Damn High | 10+ housing complaints | `rent_is_too_damn_high.svg` |
| `peacemaker` | Peacemaker | De-escalated 3+ heated threads | `peacemaker.svg` |
| `fact_checker` | Fact Checker | Provided sources in 5+ debates | `fact_checker.svg` |
| `event_evangelist` | Event Evangelist | Shared 20+ local events | `event_evangelist.svg` |
| `hidden_gem_hunter` | Hidden Gem Hunter | Shared 5+ underrated spots | `hidden_gem_hunter.svg` |
| `one_topic_wonder` | One Topic Wonder | 50+ posts same niche topic | `one_topic_wonder.svg` |
| `lurker_emeritus` | Lurker Emeritus | First post after 5+ years | `lurker_emeritus.svg` |
| `achievement_hunter` | Achievement Hunter | Unlocked 10+ achievements | `achievement_hunter.svg` |
| `techie_blamer` | Techie Blamer | Blamed tech workers | `techie_blamer.svg` | Seattle |
| `old_seattle` | Old Seattle Energy | "Back in my day" 5+ times | `old_seattle.svg` | Seattle |

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
| `speedrunner` | Speedrunner | Reached 25 points in under 7 days | `speedrunner.svg` |
| `og_local` | OG Local | 10+ year account, positive contributor | `og_local.svg` |
| `good_faith_debater` | Good Faith Debater | Changed mind publicly | `good_faith_debater.svg` |
| `hall_of_famer` | Hall of Famer | Featured in Hall of Shame wiki | `hall_of_famer.svg` |

### Tier: Platinum (Excellence)

| ID | Name | Unlock Condition | Asset |
|----|------|------------------|-------|
| `legendary_salt_lord` | Legendary Salt Lord | 50+ salt points | `legendary_salt_lord.svg` |
| `completionist` | Completionist | Unlocked all Bronze achievements | `completionist.svg` |

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

1. **checkAchievements()** evaluates all 63 achievements against user stats
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
Bronze (27)  ->  Silver (21)  ->  Gold (11)  ->  Platinum (2)  ->  Diamond (2)
   5 pts          10 pts          25 pts          50 pts          100 pts
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

**Add your ideas here!** Most ideas from the original list have been implemented! Feel free to add new ideas or submit PRs.

*Note: Achievements marked with "Seattle" in the registry require `enableSeattleAchievements` setting to be enabled.*

### Villain Achievements (Hater Recognition)

*All villain achievements from this section have been implemented! Add new ideas below:*

| ID | Name | Condition | Tier | Roast Idea |
|----|------|-----------|------|------------|
| `your_idea_here` | Your Idea | Describe the trigger | Tier | "Your roast" |

### Hero Achievements (Positive Recognition)

*All hero achievements from this section have been implemented! Add new ideas below:*

| ID | Name | Condition | Tier | Praise Idea |
|----|------|-----------|------|-------------|
| `your_idea_here` | Your Idea | Describe the trigger | Tier | "Your praise" |

### Chaotic Neutral Achievements

*All chaotic neutral achievements from this section have been implemented! Add new ideas below:*

| ID | Name | Condition | Tier | Comment Idea |
|----|------|-----------|------|--------------|
| `your_idea_here` | Your Idea | Describe the trigger | Tier | "Your comment" |

### Meta Achievements

*All meta achievements from this section have been implemented! Add new ideas below:*

| ID | Name | Condition | Tier | Comment Idea |
|----|------|-----------|------|--------------|
| `your_idea_here` | Your Idea | Describe the trigger | Tier | "Your comment" |

### Seattle-Specific Ideas

*All Seattle-specific achievements from this section have been implemented! These require `enableSeattleAchievements` setting.*

| ID | Name | Condition | Tier | Comment Idea |
|----|------|-----------|------|--------------|
| `your_idea_here` | Your Idea | Describe the trigger | Tier | "Your comment" |

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
| 2025-01-11 | Implemented all 37 future achievement ideas (total: 63) |
| 2025-01-11 | Added seattleSpecific flag for regional achievements |
