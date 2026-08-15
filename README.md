# router-dom

> A lightweight router for single-page applications with faster subsequent page-loads by prefetching links during idle time if the user is not saving data.
>
> - it helps to reduce the delay between your pages, to minimize browser HTTP requests and enhance your user's web experience.
> - library agnostic.
> - simple: define your routes, start to listen global event and to route changes.
> - base href support.
> - opt-in errorHandler and formHandler.
> - support in all modern browsers.
> - Dynamic route params and nested Routes.

## Demo

Simple: https://codepen.io/FabianK/pen/vYxXjwv?editors=1000<br>
Advanced: https://page-transitions-router.netlify.app

## Installation

With npm:

```properties
$ npm i router-dom
```

or via CDN:

```html
<script type="module">
  import Router from "https://cdn.skypack.dev/router-dom";
  new Router(...) // see Constructor Documentation
</script>
```

## Usage

```html
<a href="/">Home</a>
<a href="/about">About</a>

<div data-outlet></div>
```

## Dependencies

[path-to-regexp](https://github.com/pillarjs/path-to-regexp): Turn a path string such as '/user/:name' into a regular expression<br>
[hydro-js](https://github.com/Krutsch/hydro-js): Renders the view. In order to pass state via an anchor element (data attribute), a mapping on the hydro object is needed.<br>

## Documentation

### Events

- window: beforeRouting & afterRouting

### Constructor

The router class takes an array with at least one entry. Only the path is mandatory.<br>
Either a template or and element will be rendered in your element with attribute `data-outlet`.<br>
You can also specifiy one-level of children.<br> One more interesting property is the `restoreScroll`.
Scroll positions are stored per history entry, like the browser does natively: every entry gets an internal `__routerScroll` key inside `history.state`, and its position is persisted in `sessionStorage` under `router-scroll`. New navigations always start on top, history traversal (back/forward) restores the position of that entry, and reloads are restored by the browser itself (`history.scrollRestoration` is handed back to `auto` on `pagehide`), so SSR pages do not flash. BFCache restores stay untouched. Restoration keeps correcting while late-rendered content grows and aborts as soon as the user scrolls. No consumer setup is required; `scrollBehavior` only applies to the top reset of new navigations.
The second argument is the optional object options: it can take a general errorHandler, a formHandler, a fetchOptions for the form and the scrollBehavior. Set `viewTransitions: true` to wrap client-side route DOM commits in `document.startViewTransition()` when available. If there is a formHandler, form submits will handled via attributes on the form element and fetch.

```js
const router = new Router([
  {
    path: "/",
    restoreScroll: true, // defaults to true
  },
  {
    path: "/about",
    templateUrl: "/about.html",
    leave: ({ from, to, params, state }) => {},
  },
  {
    path: "/contact/:name",
    element: "<h2>Drop a message on [...]</h2>" // or an actual Node Element,
    beforeEnter: ({ from, to, params, state }) => {},
    afterEnter: ({ from, to, params, state }) => {},
  },
]);
```

### Server-rendered initial route

Set `data-router-path` on the route outlet to current pathname, optionally including query string, when server already rendered that route:

```html
<main data-outlet data-router-path="/about">Server-rendered content</main>
```

When the marker matches a configured route, the constructor adopts the existing DOM, skips the duplicate initial template request and render, then consumes the marker. Later navigation behaves normally. Missing or stale markers keep the original client-rendered startup behavior.

### go

- Takes a path, a state object and optional params. Will redirect to the path.

### removeRoute

- Removes a route from the route registry.

### addRoute

- Adds a route object to the route registry.

### modifyRoute

- Replaces a route with a new one in the route registry.

`router.routes` returns a frozen snapshot for inspection. Use `addRoute`, `removeRoute`, and `modifyRoute` for mutations. Only one `Router` instance should own browser navigation per document.

### changeOptions

- Replaces the router options.

### static getParams

- Returns the params as key-value pair.
