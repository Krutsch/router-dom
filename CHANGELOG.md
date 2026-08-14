# Changelog

## 4.0.0-rc3 2026-08-14

- keep Navigation API routing and native URLPattern matching while moving lifecycle, rendering, browser, and route-registry behavior behind focused modules
- preserve navigation-entry state and cancellation signals through lifecycle routing
- make `router.routes` a frozen inspection snapshot; use `addRoute`, `removeRoute`, and `modifyRoute` for mutations
- isolate template loading and cache requests per router instance
- route malformed encoded parameters through `errorHandler`
- preserve SSR adoption, nested atomic rendering, forms, prefetching, scroll restoration, and View Transitions

## 4.0.0-rc2 2026-08-13

- preserve native page reloads when using the Navigation API

## 4.0.0-rc1 2026-08-11

- correct peer version

## 4.0.0-rc0 2026-08-11

- migrate client-side routing from the History API to the browser Navigation API
- replace path-to-regexp with native URLPattern route matching
- preserve lifecycle hooks, nested routes, forms, prefetching, scroll restoration, SSR adoption, and View Transitions

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
