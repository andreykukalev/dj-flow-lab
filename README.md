# DJ Flow Lab

A music-learning product that helps DJs understand **why** a transition works musically, **when** to make it, and **how** to carry it out, by connecting musical reasoning, synchronized audio, and a virtual controller.

The first product is the **Transition Builder**: load two of your own tracks, choose where to leave one and enter the other, try different transition approaches, and watch the mixer perform each one while you listen.

## Documents

- [Product brief](docs/product-brief.md)
- [MVP architecture](docs/architecture.md)
- [MVP backlog](docs/backlog.md)

## Development

Requires Node 22 or later.

```sh
npm install
npm run dev        # start the app at http://localhost:5173
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright; run `npx playwright install chromium` once)
npm run typecheck
npm run lint
npm run format
```

Code layout and design rules are described in [docs/architecture.md](docs/architecture.md). The short version: `src/engine` is pure TypeScript with no browser dependencies, and the audio, the virtual mixer, and the explanations all read from the same transition plan.
