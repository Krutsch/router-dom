# Changelog

## 3.3.6 2026-08-15

- key saved scroll positions per history entry instead of per url, so a new visit of an already seen url starts on top while back/forward restores the position of that entry
- stamp history entries with an internal `__routerScroll` key (`history.state`); it is stripped from the `state` passed to route hooks
- restore reloads through the browser's native restoration and only correct late-rendered content afterwards, removing the scroll flash on SSR and view-transition apps
- keep restoring while the target route is still growing, abort on user scroll intent and stop after 3s instead of observing the DOM for 10s
- restore traversal positions instantly, `scrollBehavior` now only applies to the top reset of new navigations
- leave BFCache restoration to the browser and share one scroll owner per document

## 3.3.5 2026-08-14

- use the browser's native scroll restoration for document reloads
- avoid overriding native scroll when adopting an SSR-rendered initial route
- keep top resets and saved-position restoration inside the router for intercepted navigation and history traversal
- switch to manual restoration only for router-managed SPA history entries, returning to native mode on page hide
- preserve initial-load scroll and BFCache restoration ownership
- tolerate unavailable session storage and clean disabled-route scroll entries

## 3.3.4 2026-08-14

- refactor routing into route registry, route renderer, route orchestrator, and browser adapters
- preserve `RegExp` shape on resolved route paths while isolating matcher implementation
- make `router.routes` a frozen inspection snapshot; use `addRoute`, `removeRoute`, and `modifyRoute` for mutations (**breaking for direct array mutation**)
- isolate template loading and cache requests per router instance
- route malformed encoded parameters through `errorHandler`
- normalize legacy optional trailing slash paths such as `{/}?`
- normalize legacy unnamed wildcard paths such as `/*`
- browser shell supports one active Router per document; multiple Router instances in one document remain unsupported

## 3.3.3 2026-08-12

- correct the hydro-js peer dependency metadata

## 3.3.2 2026-08-12

- add peer-dep hydro-js

## 3.3.1 2026-08-11

- add manual scroll restoration for back/forward cache

## 3.3.0 2026-07-17

- add ViewTransition for SPA

## 3.2.0 2026-07-17

- improved SSR compatibility

## 3.1.1 2026-07-11

- fix bugs

## 3.1.0 2026-07-03

- update to latest deps and refactor

## 3.0.3 2025-02-15

- fix html not loading on nested reload

## 3.0.2 2025-02-14

- fix nested route bug

## 3.0.1 2024-09-26

- fix scrollHandling in combination with html-bundle

## 3.0.0 2024-09-25

- pin path-to-regexp to version 6.3.0
- rename restoreScrollOnReload to restoreScroll
- default restoreScroll to true
- add improved restoreScroll behavior per route
- add option `fetchOptions` to router for forms
