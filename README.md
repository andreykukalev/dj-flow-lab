# DJ Flow Lab

A music-learning product that helps DJs understand **why** a transition works musically, **when** to make it, and **how** to carry it out, by connecting musical reasoning, synchronized audio, and a virtual controller.

The first product is the **Transition Builder**: load two of your own tracks, choose where to leave one and enter the other, try different transition approaches, and watch the mixer perform each one while you listen. Choosing that moment is the heart of it: mark moments in both tracks, try any pairing (including ones that do not work), and find out why each one worked or did not.

## Documents

- [Product brief v0.4](docs/PRODUCT_BRIEF_v0.4.md) (current), [v0.3](docs/PRODUCT_BRIEF_v0.3.md) and [v0.2](docs/product-brief.md) (history)
- [Technical audit of v0.2](docs/TECHNICAL_AUDIT_v0.2.md)
- [Technical decisions](docs/TECHNICAL_DECISIONS.md)
- [Technical spikes and proof of concept](docs/TECHNICAL_SPIKES.md)
- [MVP implementation plan](docs/MVP_IMPLEMENTATION_PLAN.md)
- [Technical risks](docs/RISKS.md)
- [MVP backlog](docs/backlog.md) and [architecture proposal](docs/architecture.md) (v0.2)
- [UX concept](design/ios/README.md) (iOS mockups) and [web adaptation](docs/WEB_UX.md)
- [Musical language](docs/MUSICAL_LANGUAGE.md): musical functions and track structure terms

## Development

Requires Node 22 or later.

```sh
npm install
npm run dev        # start the app at http://localhost:5173
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests on Chromium and Firefox (run `npx playwright install chromium firefox` once)
# CI skips the slow measurement tests: add `--grep-invert @slow` to do the same
npm run typecheck
npm run lint
npm run format
```

The proof-of-concept page is at `/poc/` (http://localhost:5173/poc/ in development, and on every deployment): a long blend on two generated demo tracks, or on two of your own files with their BPM and downbeat typed or nudged, with the Try screen's mixer following what you hear. _Auto_ suggests a blend start and area from both tracks' phrase lines, level and low end, says why, and keeps your own choice to compare with. Space plays and pauses, the arrow keys move by a bar (Shift: a phrase), R replays, and _Flash on beat_ with _Offset_ checks and calibrates the audio–visual sync.

Code layout and design rules are described in [docs/architecture.md](docs/architecture.md). The short version: `src/engine` is pure TypeScript with no browser dependencies, and the audio, the virtual mixer, and the explanations all read from the same transition plan.

## Deployment

The app is hosted on [Azure Static Web Apps](https://learn.microsoft.com/azure/static-web-apps/). The `Deploy` workflow builds the app, deploys `main` to production, and gives every pull request its own preview URL (posted as a comment on the pull request and removed when it closes). Routing and security headers live in `public/staticwebapp.config.json`.

One-time setup: provision the Azure resources with the Bicep template in [`infra/`](infra/README.md) (`./infra/deploy.ps1 -SetGitHubSecret` on Windows), which creates the Static Web App and stores its deployment token as the repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.

Until the secret exists, the workflow builds the app and skips the deploy step.

### Audio tests

Browser tests live in `e2e/` (app) and `tests/` (audio integration). Audio tests open the test-only page `/harness/`, which exposes synthetic signals, measurements and offline rendering on `window.harness`, and run the same checks in every engine. The page is served by the Vite dev server and is not part of the production build. On Linux without a sound card, Firefox needs a virtual audio device for real-time tests (see the CI workflow).
