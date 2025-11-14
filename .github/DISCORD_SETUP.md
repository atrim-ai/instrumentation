# Discord Community Setup

This document outlines the setup for the `#atrim-instrumentation` Discord channel for community support.

## Channel Setup

### 1. Create Discord Webhook

1. Go to your Discord server (Atrim.ai)
2. Navigate to the `#atrim-instrumentation` channel
3. Click the gear icon (Edit Channel) → Integrations → Webhooks
4. Click "New Webhook"
5. Configure the webhook:
   - **Name:** Instrumentation CI
   - **Channel:** #atrim-instrumentation
   - **Avatar:** (Optional) Upload a custom avatar
6. Click "Copy Webhook URL"

### 2. Add Webhook to GitHub Secrets

```bash
# Using GitHub CLI
gh secret set DISCORD_WEBHOOK_URL

# Or manually:
# 1. Go to https://github.com/atrim-ai/instrumentation/settings/secrets/actions
# 2. Click "New repository secret"
# 3. Name: DISCORD_WEBHOOK_URL
# 4. Value: Paste the webhook URL from Discord
# 5. Click "Add secret"
```

### 3. Add NPM Token to GitHub Secrets

```bash
# Generate NPM token at https://www.npmjs.com/settings/[username]/tokens
# Create a "Automation" token with "Publish" permission

gh secret set NPM_TOKEN

# Or manually add it at:
# https://github.com/atrim-ai/instrumentation/settings/secrets/actions
```

## Channel Configuration

### Channel Topic
```
Support for @atrim/instrumentation - Universal OpenTelemetry instrumentation library
📖 Docs: https://github.com/atrim-ai/instrumentation
🐛 Issues: https://github.com/atrim-ai/instrumentation/issues
📦 npm: https://www.npmjs.com/package/@atrim/instrumentation
```

### Channel Description
```
Get help with the @atrim/instrumentation library. Ask questions, report bugs, share feedback, and connect with other users.
```

### Suggested Channel Rules/Guidelines

Post these as a pinned message or in the channel description:

```markdown
# @atrim/instrumentation Support Channel

Welcome! This channel is for getting help with the `@atrim/instrumentation` library.

## How to Get Help

**Before posting:**
- ✅ Check the [documentation](https://github.com/atrim-ai/instrumentation)
- ✅ Search [existing issues](https://github.com/atrim-ai/instrumentation/issues)
- ✅ Review [troubleshooting guide](https://github.com/atrim-ai/instrumentation/blob/main/docs/TROUBLESHOOTING.md)

**When asking for help, include:**
- Node.js version (`node --version`)
- Library version (`npm list @atrim/instrumentation`)
- Framework (Express, Fastify, Effect, etc.)
- Minimal reproduction code
- Error messages (full stack trace)

## Quick Links

- 📖 [Documentation](https://github.com/atrim-ai/instrumentation)
- 🐛 [Report a Bug](https://github.com/atrim-ai/instrumentation/issues/new)
- 💡 [Request a Feature](https://github.com/atrim-ai/instrumentation/issues/new)
- 📦 [npm Package](https://www.npmjs.com/package/@atrim/instrumentation)
- 📋 [Examples](https://github.com/atrim-ai/instrumentation/blob/main/docs/EXAMPLES.md)

## CI Notifications

This channel also receives automated notifications from GitHub Actions:
- ✅ Build successes (main branch only)
- ❌ Build failures (all branches)
- 🎉 Release notifications
```

## Discord Invite Link

Create a permanent invite link for the channel:

1. Right-click the `#atrim-instrumentation` channel
2. Click "Invite People"
3. Click "Edit Invite Link"
4. Set "Expire After" to "Never"
5. Set "Max Uses" to "No Limit"
6. Copy the invite link

Example: `https://discord.gg/YOUR_INVITE_CODE`

Add this to the README.md:

```markdown
## Community & Support

- 💬 [Discord Community](https://discord.gg/YOUR_INVITE_CODE) - Get help and discuss the library
- 🐛 [GitHub Issues](https://github.com/atrim-ai/instrumentation/issues) - Report bugs and request features
- 📖 [Documentation](https://github.com/atrim-ai/instrumentation) - Read the docs
```

## Channel Permissions

Recommended permissions for the `#atrim-instrumentation` channel:

- **@everyone:**
  - ✅ View Channel
  - ✅ Read Message History
  - ✅ Send Messages
  - ✅ Embed Links
  - ✅ Attach Files
  - ✅ Add Reactions
  - ❌ Mention @everyone, @here, and All Roles
  - ❌ Manage Messages

- **Moderators/Maintainers:**
  - ✅ All permissions
  - ✅ Pin Messages
  - ✅ Manage Messages
  - ✅ Manage Threads

## Notification Settings

The webhook notifications from GitHub Actions will:

- ✅ Post build start messages (main branch only)
- ✅ Post success messages (main branch only)
- ✅ Post failure messages (all branches)
- ✅ Mention @clayroach on failures
- ✅ Include error details for debugging
- ✅ Provide links to GitHub Actions runs

To customize notification behavior, edit:
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`

## Testing Notifications

After setting up the webhook, test it:

1. Push a commit to a feature branch
2. Verify CI runs in GitHub Actions
3. Check Discord for notification (should appear on failure only)
4. Push to main branch
5. Verify notification appears in Discord

## Maintenance

- Monitor channel for spam/abuse
- Pin important messages (release announcements, breaking changes)
- Update channel topic when major versions are released
- Rotate webhook URL if compromised

## Troubleshooting

**Notifications not appearing:**
- Check webhook URL is correct in GitHub secrets
- Verify webhook is not deleted in Discord
- Check GitHub Actions logs for webhook errors
- Test webhook manually with curl

**Too many notifications:**
- Edit `.github/workflows/ci.yml` to reduce notification frequency
- Change `if: always()` to `if: failure()` in notify jobs
- Remove `github.ref == 'refs/heads/main'` condition to only notify on failures
