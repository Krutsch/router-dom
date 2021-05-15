# router-dom

> A lightweight router for single-page applications.
>
> - it helps to reduce the delay between your pages, to minimize browser HTTP requests and enhance your user's web experience.
> - library agnostic.
> - simple: define your routes, start to listen to route changes
> - base support
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

Use the href attribute in order to help `quicklink` prefetching the resource and use data-href as routing path.

```html
<a href="/">Home</a>
<a href="about.html" data-href="/about">About</a>
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
    path: "/",
  },
  {
    path: "/about",
    templateUrl: "/about.html",
    leave: ({ from, to, state, params }) => ...
  },
  {
    path: "/contact/:name",
    element: html`<h2>Drop a message on [...]</h2>`,
    beforeEnter: ({ from, to, state, params }) => ...,
    afterEnter: ({ from, to, state, params }) => ...
  }
]);
```

### go

- Takes a path, a state object and optional params. Will redirect to the path.

### removeRoute

- Removes a route from the routes array.

### addRoute

- Adds a route object to the routes array.

### modifyRoute

- Replaces a route with a new one.

### changeOptions

- Replaces the router options.

### getParams

- Returns the params as key-value pair.

## To Do

- Add tests
- Add nested routes
