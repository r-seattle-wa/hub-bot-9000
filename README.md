# Hub Bot 9000

**The complete Reddit community toolkit.**

Hub Bot 9000 is an integrated suite of [Devvit](https://developers.reddit.com) applications that work together to help moderators build engaged, self-aware communities. Originally forged in the fires of [r/SeattleWA](https://reddit.com/r/SeattleWA), now available for any subreddit.

---

## The Suite

### Brigade Sentinel
**brigade-sentinel** - The TotesMessenger revival with teeth

Monitors when other subreddits link to yours, analyzes threads for coordinated activity, and maintains transparency about outside influence.

**Features:**
- **Crosslink Detection** - Real-time via PullPush.io with Gemini AI fallback
- **Brigade Analysis** - Analyzes target threads for first-time posters, suspicious timing, and origin tracking
- **Hater Leaderboard** - Tracks hostile actors across subreddits and individuals
- **Hall of Shame** - Human-readable wiki page showcasing top haters
- **Achievement System** - 27 Xbox-style achievements for dedicated detractors
- **Traffic Spike Detection** - Early warning for unusual activity

#### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| enabled | boolean | true | Master toggle |
| homeSubreddit | string | installed sub | Target subreddit to monitor |
| publicComment | boolean | true | Post public alert in linked thread |
| modmailNotify | boolean | true | Send modmail for adversarial sources |
| stickyComment | boolean | false | Sticky the bot comment |
| showStickyOnFirstTimePosters | boolean | true | Show brigade evidence in sticky |
| firstTimePosterThreshold | number | 3 | Min first-time posters to show sticky |
| firstTimePosterPercentThreshold | number | 20 | Min percent first-timers to show sticky |
| adversarialThreshold | number | 3 | Adversarial links before sticky |
| hatefulThreshold | number | 1 | Hateful links before sticky |
| geminiApiKey | secret | - | For AI classification (BYOK) |

#### Example: Brigade Alert Sticky Comment

When a thread is crosslinked and brigade evidence is detected:

**Brigade Evidence Analysis**

| Metric | Value |
|--------|-------|
| Unique commenters | 47 |
| First-time posters | 19 (40%) |
| Confidence | HIGH |

**Top Source Communities:**
- r/SubredditDrama: 12 users
- r/Drama: 4 users
- r/HobbyDrama: 3 users

**Notable Patterns:**
- Temporal clustering: 15 comments within 30 minutes of crosslink
- New accounts: 3 accounts less than 30 days old
- Negative karma: 5 commenters with negative subreddit karma

---

### Haiku Sensei
**haiku-sensei** - The accidental poet detector

Catches users accidentally writing in 5-7-5 syllable patterns and gently illuminates their unintentional poetry.

#### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| enabled | boolean | true | Master toggle |
| replyDelaySeconds | number | 30 | Delay before reply |
| enableBotReplies | boolean | true | AI replies to users who respond |
| geminiApiKey | secret | - | For AI-powered replies (BYOK) |

---

### Farewell Hero
**farewell-hero** - The unsubscribe statistician + tribute generator

Responds to unsubscribing posts with statistical analysis and handles the tribute command.

#### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| enabled | boolean | true | Master toggle |
| sarcasmLevel | select | neutral | polite/neutral/snarky/roast/freakout |
| matchToneToUser | boolean | true | Match response to user tone |
| enableTributes | boolean | true | Enable tribute command |
| allowUserTributes | boolean | true | Allow u/username targets |
| defaultTributeTarget | string | Seattle | Default subreddit for tribute |
| groqApiKey | secret | - | Groq API (free tier) for tributes |
| geminiApiKey | secret | - | Gemini fallback |

#### Sarcasm Levels

| Level | Example |
|-------|---------|
| POLITE | Thank you for being part of our community. Best wishes\! |
| NEUTRAL | Activity summary: 12 posts, 47 comments over 2 years. |
| SNARKY | We will definitely notice your 2 contributions. |
| ROAST | Your 2 contributions will be missed. By literally no one. |
| FREAKOUT | OH NO\! NOT SOMEONE WITH 2 CONTRIBUTIONS\! |

---

### Hub Widget
**hub-widget** - Unified activity dashboard

Custom Post Type showing bot activity with color-coded events.

| Type | Icon | Color | Description |
|------|------|-------|-------------|
| Brigade Alert | \! | Red | Cross-subreddit link detected |
| Haiku Detection | * | Teal | Haiku found |
| Farewell | ~ | Yellow | Unsubscribe announcement |
| Traffic Spike | ^ | Orange | Unusual activity |
| Community Event | @ | Purple | Local events |

---

## Achievement System

27 achievements across 5 tiers:

| Tier | Threshold | Examples |
|------|-----------|----------|
| Bronze | 5+ | Casual Complainer, Echo Enthusiast |
| Silver | 10+ | Serial Brigader, Rage Machine |
| Gold | 25+ | Professional Hater, Evidence Eraser |
| Platinum | 50+ | Legendary Salt Lord |
| Diamond | 100+ | Transcendent Malcontent |

---

## Wiki Pages

| Wiki Page | Purpose | Format |
|-----------|---------|--------|
| hub-bot-9000/hater-leaderboard | Raw leaderboard data | JSON |
| hub-bot-9000/hall-of-shame | Human-readable leaderboard | Markdown |
| hub-bot-9000/events-feed | Activity log | JSON |
| hub-bot-9000/community-events | Local events | JSON |
| hub-bot-9000/user-achievements | Achievement tracking | JSON |
| hub-bot-9000/opt-out | Opt-out list | JSON |

---

## AI Features (BYOK)

All AI features use Bring Your Own Key:

| Provider | Used For | Cost |
|----------|----------|------|
| Gemini Flash | Tone classification, roasts, brigade analysis | Free tier |
| Groq | Primary tribute generation | Free tier |

---

## Mod Menu Actions

| Action | Location | Description |
|--------|----------|-------------|
| Analyze Drama Thread | Subreddit | Analyze drama thread URL for haters |
| Analyze for Brigade | Post | Analyze post for brigade evidence |
| View Hater Leaderboard | Subreddit | Quick leaderboard access |
| Update Hall of Shame | Subreddit | Regenerate wiki |
| Scan for Crosslinks Now | Subreddit | Force crosslink scan |

---

## Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| scanForCrosslinks | Every 15 min | Find crosslinks, analyze targets |
| enrichHatersOSINT | Daily 3am | Analyze deleted content |
| fetchCommunityEventsJob | Every 6 hours | Fetch local events |
| updateHallOfShameJob | Every 6 hours | Regenerate Hall of Shame |

---

## Privacy and Compliance

- All bot comments include disclosure footers
- Only public data analyzed
- No sensitive attribute inference
- Opt-out by blocking the bot account
- Rate limiting prevents spam
- BYOK model - mods pay for their own AI usage

See PRIVACY.md and TERMS.md.

---

## License

MIT - see LICENSE

## Community

- Discord: discord.gg/seattle
- Issues: GitHub Issues
