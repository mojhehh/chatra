---
applyTo: '**'
---

# Chatra Project Guidelines

## Project Summary
Chatra is a real-time chat application built with Firebase (Realtime Database, Auth) and a Cloudflare Worker for email verification and AI features. Frontend is vanilla JS with Tailwind CSS.

## Contribution Rules
- **Branching**: Create feature branches from `main` (e.g., `feature/add-groups`, `fix/dm-bug`)
- **PR Format**: Title should be `[Type] Brief description` (e.g., `[Fix] DM thread permissions`)
- **Commits**: Use imperative mood, keep under 72 chars (e.g., `Fix rate limit in AI handler`)

## Code Style
- JavaScript: Use `const`/`let`, avoid `var`; prefer template literals
- Indentation: 2 spaces for JS/HTML/CSS
- No trailing whitespace; files end with newline
- Run `strip-all-comments.js` before committing production builds

## Testing & CI
- Test locally with `python -m http.server 8080`
- Verify Firebase rules with the emulator before deploying
- Worker changes: test with `wrangler dev` before `wrangler deploy`

## Security Notes
- Never commit API keys or secrets—use `wrangler secret put`
- Keep Firebase service account JSON in environment variables only
- All user input must be validated client-side AND in Firebase rules

## PR Checklist
- [ ] Code follows style guidelines
- [ ] No secrets or keys committed
- [ ] Firebase rules updated if data structure changed
- [ ] Tested on localhost
- [ ] Commit messages are clear and concise
