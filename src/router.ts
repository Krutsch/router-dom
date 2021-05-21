import { listen } from "quicklink";
import { pathToRegexp } from "path-to-regexp";
import { render, html, hydro, $, $$ } from "hydro-js";

listen();

let router: Router;
const outletSelector = "[data-outlet]";
const reactivityRegex = /\{\{([^]*?)\}\}/;
const flagsRegex = /:\w+/g;
let base = $("base")?.getAttribute("href") || "";
if (base.endsWith("/")) {
  base = [...base].slice(0, -1).join("");
}

addEventListener("popstate", async (e) => {
  //@ts-ignore
  router.doRouting(location.pathname, e);
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
        originalPath: base + route.path,
      };
    }) as [Route, ...Route[]];

    this.routes = newRoutes;
    this.options = options;
    router = this;

    this.doRouting();
  }

  private async doRouting(to: string = location.pathname, e?: PopStateEvent) {
    dispatchEvent(new Event("beforeRouting"));
    const from = this.oldRoute ?? to;
    const route = getMatchingRoute(to);
    if (route) {
      try {
        const [_, ...values] = to.match(route.path)!;
        const params = Array.from(route.originalPath.matchAll(flagsRegex))
          .flat()
          .map((i) => i.replace(":", ""))
          .reduce((state: LooseObject, key, idx) => {
            state[key] = values[idx];
            return state;
          }, {});

        const allParams = { ...this.getParams(), ...params };
        const props = {
          from: from.replace(base, ""),
          to: to.replace(base, ""),
          ...(Object.keys(allParams).length ? { params: allParams } : {}),
          ...history.state,
        };

        // Trigger leave
        if (this.oldRoute) {
          const oldRoute = this.routes.find((route) =>
            route.path.exec(this.oldRoute!)
          );
          if (oldRoute) {
            await oldRoute[cycles.leave]?.(props);
            this.oldRoute = route.originalPath;
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
      } catch (err) {
        if (this.options.errorHandler) {
          await this.options.errorHandler(err, e);
        } else {
          console.error(err, e);
        }
      } finally {
        dispatchEvent(new Event("afterRouting"));
      }
    }
  }

  go(path: string, state: LooseObject, params = "") {
    this.oldRoute = location.pathname;
    const newPath = base + path + params;

    // Only navigate when the path differs
    if (newPath !== this.oldRoute) {
      history.pushState({ ...state }, "", newPath);
      this.doRouting(newPath);
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
      path: pathToRegexp(base + route.path),
      originalPath: base + route.path,
    });
  }

  modifyRoute(path: string, newRoute: RouteParam) {
    const idx = this.routes.findIndex(
      (route) => String(route.path) === String(pathToRegexp(path))
    );
    if (idx > -1) {
      this.routes[idx] = {
        ...newRoute,
        path: pathToRegexp(base + newRoute.path),
        originalPath: base + path,
      };
    }
  }

  changeOptions(options: Options) {
    this.options = options;
  }

  getParams(search = location.search) {
    return Object.fromEntries(new URLSearchParams(search));
  }
}

function getMatchingRoute(path: string): Route | undefined {
  if (path.startsWith(".")) {
    path = path.replace(".", "");
  }
  return router.routes.find((route) => route.path.exec(path));
}

function registerAnchorEvent(anchor: HTMLAnchorElement) {
  if (anchor.getAttribute("href")?.startsWith("http")) return;
  anchor.addEventListener("click", (e: MouseEvent) => {
    e.preventDefault();
    const hasData = anchor.getAttribute("data");
    const hydroProp = replaceBars(hasData);
    let href =
      anchor.getAttribute("data-href") || anchor.getAttribute("href") || "";
    router.go(href, hasData ? hydro[hydroProp!] : void 0);
  });
}

function registerFormEvent(form: HTMLFormElement) {
  form.addEventListener("submit", (e) => {
    if (!router.options.formHandler) return;
    e.preventDefault();

    const action = form.getAttribute("action")!;
    const method = form.getAttribute("method")!;

    fetch(action, {
      method,
      ...(!["HEAD", "GET"].includes(method.toUpperCase())
        ? { body: new FormData(form) }
        : {}),
    })
      .then((res) => router.options.formHandler!(res, e))
      .catch(async (err) => {
        if (router.options.errorHandler) {
          await router.options.errorHandler(err, e);
        } else {
          console.error(err, e);
        }
      });
  });
}

function replaceBars(hydroTerm: string | null) {
  if (hydroTerm === null || !hydroTerm.includes("{{")) return hydroTerm;

  const [_, hydroPath] = hydroTerm.match(reactivityRegex) || [];
  return hydroPath;
}

// Add EventListener for every added anchor and form Element
$$("a").forEach(registerAnchorEvent);
$$("form").forEach(registerFormEvent);
new MutationObserver((entries) => {
  for (const entry of entries) {
    for (const node of entry.addedNodes) {
      const nodes = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT, {
        acceptNode(elem: Element) {
          return ["form", "a"].includes(elem.localName)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });
      let formOrA: HTMLAnchorElement | HTMLFormElement;
      while (
        (formOrA = nodes.nextNode() as HTMLAnchorElement | HTMLFormElement)
      ) {
        if (formOrA.localName === "a") {
          registerAnchorEvent(formOrA as HTMLAnchorElement);
        } else {
          registerFormEvent(formOrA as HTMLFormElement);
        }
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
  errorHandler?(err: Error, e?: PopStateEvent | Event): Promise<any> | void;
  formHandler?(res: Response, e: Event): Promise<any> | void;
}
interface RoutingProps {
  from: string;
  to: string;
  state: LooseObject;
  params?: LooseObject;
}
type LooseObject = Record<keyof any, any>;
