# Contributing to ArtixPOS

Thank you for your interest in ArtixPOS! At this time, the project is **not open for public contributions** — this repository exists as a portfolio showcase.

## What this means

- Pull requests from outside collaborators will not be accepted
- The codebase is not licensed for forking or reuse
- Issues and bug reports are welcome as feedback but may not receive a public response

## For collaborators with access

If you have been granted direct access to this repository, please follow these guidelines:

### Branch naming

| Type | Pattern | Example |
|---|---|---|
| Feature | `feat/short-description` | `feat/loyalty-tiers` |
| Bug fix | `fix/short-description` | `fix/shift-close-crash` |
| Improvement | `improve/short-description` | `improve/pos-render-perf` |
| Hotfix | `hotfix/short-description` | `hotfix/bir-zreport-total` |

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add stamp card redemption at POS
fix: correct VAT calculation for zero-rated items
improve: reduce dashboard initial load time
chore: update dependencies
```

### Pull request checklist

Before opening a PR:

- [ ] Code runs without errors (`npm run dev`)
- [ ] TypeScript passes (`npm run check`)
- [ ] No console errors in the browser
- [ ] Tested on both desktop and mobile viewport
- [ ] New UI follows existing Tailwind/Radix patterns
- [ ] No hardcoded secrets or credentials

### Code style

- TypeScript everywhere — no plain `.js` files in `server/` or `shared/`
- Shared types live in `shared/schema.ts` — never duplicate types client/server
- API routes stay thin; business logic belongs in storage or service layers
- Keep components focused — split large files into smaller, focused ones
- Use existing UI components from `client/src/components/ui/` before creating new ones

### Questions

Reach out directly to the project owner before starting large changes.
