import { listen } from "quicklink";
import { pathToRegexp } from "path-to-regexp";
import { render, html, hydro, $ } from "hydro-js";

listen();

let router: Router;
const outletSelector = "[data-outlet]";
const reactivityRegex = /\{\{([^]*?)\}\}/;
const base = $("base")?.getAttribute("href") || "";

addEventListener("popstate", async () => {
  const [route, state] = getMatchingRoute();

  if (route) {
    try {
      const to = history.state?.path ?? location.pathname;

      const [_, ...values] = to.match(route.path);
      const params = Array.from(route.originalPath.matchAll(/(?<=:)\w+/g))
        .flat()
        .reduce((state: LooseObject, key, idx) => {
          state[key] = values[idx];
          return state;
        }, {});

      const props = {
        from: router.oldRoute ?? to,
        to,
        state,
        params: { ...router.getParams(), ...params },
      };

      // Trigger leave
      if (router.oldRoute) {
        const oldRoute = router.routes.find((route) =>
          route.path.exec(router.oldRoute!)
        );
        if (oldRoute) {
          await oldRoute[cycles.leave]?.(props);
          router.oldRoute = void 0; // Will be set in function go. Also, we cannot retrieve the path from the RegExp
        }
      }

      // Trigger beforeEnter
      await route[cycles.beforeEnter]?.(props);

      // Handle template / element
      if (route?.templateUrl) {
        const data = await fetch(route.templateUrl);
        const _html = await data.text();
        render(html`<div data-outlet>${_html}</div>`, outletSelector, false);
      } else if (route?.element) {
        render(
          html`<div data-outlet>${route?.element}</div>`,
          outletSelector,
          false
        );
      } else {
        // Clear outlet
        $(outletSelector)!.textContent = null;
      }

      // Trigger afterEnter
      await route[cycles.afterEnter]?.(props);
    } catch (e) {
      (await router.options.errorHandler?.(e)) || console.error(e);
    }
  }
});

export default class Router {
  options: Options;
  routes: [Route, ...Route[]];
  oldRoute: undefined | string;

  constructor(routes: [RouteParam, ...RouteParam[]], options: Options = {}) {
    const newRoutes = routes.map((route) => {
      return {
        ...route,
        path: pathToRegexp(base + route.path),
        originalPath: route.path,
      };
    }) as [Route, ...Route[]];

    this.routes = newRoutes;
    this.options = options;
    router = this;

    this.triggerEvent();
  }

  private triggerEvent() {
    dispatchEvent(new Event("popstate"));
  }

  go(path: string, state: LooseObject, params = "") {
    this.oldRoute = location.pathname;

    // Only navigate when the path differs
    if (path !== this.oldRoute) {
      history.pushState({ path: path + params, ...state }, "", path + params);

      this.triggerEvent();
    }
  }

  removeRoute(path: string) {
    const idx = this.routes.findIndex(
      (route) => String(route.path) === String(pathToRegexp(path))
    );
    if (idx > -1) {
      this.routes.splice(idx, 1);
    }
  }

  addRoute(route: RouteParam) {
    this.routes.push({
      ...route,
      path: pathToRegexp(route.path),
      originalPath: route.path,
    });
  }

  modifyRoute(path: string, newRoute: RouteParam) {
    const idx = this.routes.findIndex(
      (route) => String(route.path) === String(pathToRegexp(path))
    );
    if (idx > -1) {
      this.routes[idx] = {
        ...newRoute,
        path: pathToRegexp(newRoute.path),
        originalPath: path,
      };
    }
  }

  changeOptions(options: Options) {
    this.options = options;
  }

  getParams() {
    return Object.fromEntries(new URLSearchParams(location.search));
  }
}

function getMatchingRoute(): [Route | undefined, LooseObject] {
  let { path, ...state } = history.state || {
    path: location.pathname,
  };

  if (path.startsWith(".")) {
    path = path.replace(".", "");
  }
  return [router.routes.find((route) => route.path.exec(path)), state];
}

function registerAnchorEvent(anchor: HTMLAnchorElement) {
  anchor.addEventListener("click", (e: MouseEvent) => {
    e.preventDefault();
    const hasData = anchor.getAttribute("data");
    const hydroProp = replaceBars(hasData);
    let href = anchor.getAttribute("href") || "";
    if (href.startsWith(".")) {
      href = href.replace("./", "");
    } else if (href.startsWith("/") && href.length > 1) {
      href = href.replace("/", "");
    }
    router.go(base + href, hasData ? hydro[hydroProp!] : void 0);
  });
}

function replaceBars(hydroTerm: string | null) {
  if (hydroTerm === null || !hydroTerm.includes("{{")) return hydroTerm;

  const [_, hydroPath] = hydroTerm.match(reactivityRegex) || [];
  return hydroPath;
}

// Add EventListener for every added anchor Element
document.body.querySelectorAll("a").forEach(registerAnchorEvent);
new MutationObserver((entries) => {
  for (const entry of entries) {
    for (const node of entry.addedNodes) {
      const anchors = document.createNodeIterator(
        node,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(elem: Element) {
            return elem.localName === "a"
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          },
        }
      );
      let anchor;
      while ((anchor = anchors.nextNode() as HTMLAnchorElement)) {
        registerAnchorEvent(anchor);
      }
    }
  }
}).observe(document.body, { childList: true, subtree: true });

const enum cycles {
  leave = "leave",
  beforeEnter = "beforeEnter",
  afterEnter = "afterEnter",
}
interface RouteBasic {
  templateUrl?: string;
  element?: Node;
  [cycles.leave]?(routingProps: RoutingProps): Promise<any> | void;
  [cycles.beforeEnter]?(routingProps: RoutingProps): Promise<any> | void;
  [cycles.afterEnter]?(routingProps: RoutingProps): Promise<any> | void;
}
interface RouteParam extends RouteBasic {
  path: string;
}
interface Route extends RouteBasic {
  path: RegExp;
  originalPath: string;
}
interface Options {
  errorHandler?(e: Error): Promise<any> | void;
}
interface RoutingProps {
  from: string;
  to: string;
  state: LooseObject;
}
type LooseObject = Record<keyof any, any>;
