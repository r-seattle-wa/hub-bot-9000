# Privacy Policy

**Hub Bot 9000**
*Last updated: December 27, 2024*

## Overview

Hub Bot 9000 is a Reddit Developer Platform (Devvit) application. This policy explains what data we collect, how we use it, and your rights.

## Data We Collect

### User-Submitted Events
When you submit an event, we store:
- Event title
- Event description
- Event URL
- Event date(s)
- Your Reddit username (as submitter)
- Submission timestamp
- Approval status

### Subreddit Settings
Moderators configure:
- Location settings (city name, weather grid coordinates)
- Event source links
- Community resource links
- Posting schedule preferences
- Allowed URL domains for event submissions

### Operational Data
- Scheduler job execution logs
- Error logs for debugging

## Data We Do NOT Collect

- Personal information beyond Reddit usernames
- Private messages or DMs
- Browsing history
- Data from other subreddits
- Any data not explicitly submitted to the App

## How We Use Data

- **Event Data**: Displayed in community posts and the interactive hub
- **Settings**: Configure App behavior for each subreddit
- **Usernames**: Attribution for submitted events, mod review

## Data Storage

All data is stored using Reddit's Devvit Redis storage:
- Data is isolated per subreddit installation
- Data is stored on Reddit's infrastructure
- We do not export data to external servers

## Third-Party Services

### National Weather Service API
- We request weather forecasts from api.weather.gov
- Only the configured grid point location is sent
- No user data is shared with NWS
- NWS Privacy Policy: https://www.weather.gov/privacy

## Data Retention

- **Events**: Automatically deleted 1 day after the event date passes
- **Settings**: Retained while the App is installed
- **All Data**: Deleted when the App is uninstalled from a subreddit

## Your Rights

### For Users
- You can request removal of events you submitted by contacting subreddit moderators
- Rejected events are immediately deleted

### For Moderators
- You can delete any stored events via the App interface
- Uninstalling the App removes all stored data for your subreddit
- You control what data is collected via App settings

## Data Security

- All data is stored within Reddit's secure infrastructure
- Access is limited to the installed subreddit's context
- No external databases or servers are used

## Children's Privacy

This App is not directed at children under 13. We do not knowingly collect data from children. Reddit's own age requirements apply.

## Changes to This Policy

We may update this policy as the App evolves. Changes will be noted in the "Last updated" date.

## Contact

For privacy questions or data requests, please open an issue at:
https://github.com/r-seattle-wa/hub-bot-9000/issues

## Reddit Platform

This App operates on Reddit's Developer Platform. Reddit's Privacy Policy also applies:
https://www.reddit.com/policies/privacy-policy
