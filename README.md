# router-dom

> A lightweight router for single-page applications.
>
> - it helps to reduce the delay between your pages, to minimize browser HTTP requests and enhance your user's web experience.
> - library agnostic.
> - simple: define your routes, start to listen to route changes
> - support in all modern browsers.

## Installation

With npm:

```properties
$ npm i router-dom
```

or via CDN:

```html
<script type="module">
  import Router from "https://unpkg.com/router-dom";
</script>
```

## Usage

```html
<!-- With base -->
<base href="/.../" />
<a href="./about" data="about">About</a>
<!-- href="about" without base -->
<div data-outlet></div>
```

## Dependencies

[path-to-regexp](https://github.com/pillarjs/path-to-regexp): Turn a path string such as '/user/:name' into a regular expression<br>
[quicklink](https://github.com/GoogleChromeLabs/quicklink): Faster subsequent page-loads by prefetching in-viewport links during idle time <br>
[hydro-js](https://github.com/Krutsch/hydro-js): Renders the view. In order to pass state via an anchor element (data attribute), a mapping on the hydro object is needed.<br>

## Documentation

### Constructor

The router class takes an array with at least one entry. Only the path is mandatory. Either a template or and element will be rendered in your element with attribute `data-outlet`. The second argument is the optional object options: it can take a general errorHandler.

```js
const router = new Router([
  {
    path: "about",
    templateUrl: "./about.html",
    leave: ({ from, to, state, params }) => ...
  },
  {
    path: "contact/:name",
    element: html`<h2>Drop a message on [...]</h2>`,
    beforeEnter: ({ from, to, state, params }) => ...
    afterEnter: ({ from, to, state, params }) => ...
  }
]);
```

### go

- Takes a path, an state object and optional params. Will redirect to the path.

### removeRoute

- Removes a route from the routes array.

### addRoute

- Add a route object to the routes array.

### modifyRoute

- Replace a route with a new one.

### changeOptions

- Replace the router options.

### getParams

- Return the params as key-value pair.

## To Do

- Add tests
- Nested routes
