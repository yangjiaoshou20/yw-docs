# AGENTS.md

> Workspace: `yw-docs` — Personal knowledge base / documentation site ("鹦鹉文档") built on VuePress 2 + `vuepress-theme-plume`.

## Purpose & Stack

- Static docs site. Content is Markdown under `docs/notes/`; site config lives in `docs/.vuepress/`.
- Bundler: `@vuepress/bundler-vite` (Vite). Theme: `vuepress-theme-plume` 1.0.0-rc.88. Vue 3.
- Package manager: **pnpm** (see `pnpm-lock.yaml`). `package.json` is ESM (`"type": "module"`).
- Locales: `zh-CN` default (`/`), `en-US` (`/en/`). Site title "鹦鹉文档", base `/`.

## Directory Map

```
docs/
  README.md                 # Home page
  notes/
    back-end/               # Backend notes
    front-end/              # Frontend notes
    devops/docker/          # DevOps / Docker notes
    apply-scene/            # Applied scenario notes
  .vuepress/
    config.ts               # Main VuePress config (base, locales, bundler, plugins)
    theme/index.js          # plumeTheme setup (logo, profile, navbar, notes, footer)
    navbar/index.js         # Top navigation definition
    sidebar/                # Sidebar per section (back-end, front-end, devops)
      index.js              # Aggregates sidebar `notes` export
    components/ArticleList.vue
    public/                 # Static assets (favicon.ico, home.png) — copied verbatim
    .cache/ .temp/ dist/    # Generated — ignored via .gitignore
```

`sidebar/index.js` re-exports `notes` consumed by `theme/index.js` as `notes` option. `navbar` and `notes` are the two main navigation sources for plume theme.

## Commands

All commands run from repo root. Use `pnpm`, not npm/yarn.

| Task | Command |
|------|---------|
| Dev server | `pnpm docs:dev` |
| Dev with clean cache | `pnpm docs:clean-dev` |
| Production build | `pnpm docs:build` (outputs to `docs/.vuepress/dist/`) |
| Update plume theme | `pnpm docs:update-package` (`pnpm dlx vp-update`) |

No test, lint, or typecheck scripts are configured. No CI config in repo.

## Architecture & Edit Rules

- **Config layering:** `docs/.vuepress/config.ts` → `theme/index.js` → `navbar/index.js` + `sidebar/*/index.js`. Keep navigation changes in navbar/sidebar files, not in config.ts directly.
- **Plume theme `notes` convention:** Each `sidebar/<section>/index.js` exports a notes entry; `sidebar/index.js` aggregates them. Adding a new docs section requires a new sidebar folder + registration in `sidebar/index.js`.
- **Content location:** New articles go under `docs/notes/<section>/`. They are Markdown files; plume auto-discovers via sidebar/notes config — just adding a file without sidebar entry will not appear in navigation.
- **Static assets:** Place images/icons in `docs/.vuepress/public/` and reference with absolute path `/<file>` (served at site root).
- **Path aliases:** No custom aliases configured. Use `node:path` + `path.resolve(__dirname, ...)` pattern seen in `config.ts` for absolute paths.
- **ESM only:** `package.json` has `"type": "module"` — use `import`/`export`, not `require`.

## Conventions

- Language: Content and commit messages are primarily Chinese. Follow existing style.
- Commits: `feat:` prefix observed (`feat: docker常用命令` etc.). No enforced commit hook.
- Sidebar/navbar files use plain JS (`index.js`), not TS, even though `config.ts` is TypeScript.
- Theme profile (`theme/index.js`): avatar `/home.png`, name `YYJ`, footer `Copyright © 2024-present yyj`.

## Gotchas

- `.gitignore` excludes `docs/.vuepress/.cache/`, `.temp/`, `dist/`, `/node_modules/`, `/.idea/`, and `/docs/posts/`. Don't commit build artifacts.
- No `docs/posts/` blog collection despite `@vuepress/plugin-blog` being installed — it's unused currently.
- `homepage` in `package.json` points to `https://www.baidu.com/:` (placeholder) — not the real deploy URL.
- Node version: use the version in `.nvmrc` (Node 22.18+). The current Vite 8 dependency chain rejects older Node releases.
- `base: '/'` — deploying under a sub-path requires changing `base` in `config.ts`.
- No ESLint/Prettier config — match existing formatting manually (2-space indent, single quotes in JS, semicolon-free style in theme files).
