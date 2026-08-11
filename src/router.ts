import { render, html, hydro, $ } from "hydro-js";
import {
  compileRoutes,
  getRoutePathname,
  resolveRoute,
  type ResolvedRoute,
  type RouteDefinition,
} from "./routes.js";
import { setupNavigation } from "./navigation.js";
export { compileRoutes, resolveRoute } from "./routes.js";

let router: Router;
const storageKey = "router-scroll";
const outletSelector = "[data-outlet]";
const reactivityRegex = /\{\{([^]*?)\}\}/;
const fetchCache = new WeakMap<RouteParam, Cache>();
const scheduleIdle =
  window.requestIdleCallback?.bind(window) ??
  ((callback: () => void) => window.setTimeout(callback));
let base = $("base")?.getAttribute("href") || "";
if (base.endsWith("/")) {
  base = [...base].slice(0, -1).join("");
}

interface CustomWindow extends Window {
  isHMR: boolean;
}
declare var window: CustomWindow;

// Reload -> store scrollPosition
addEventListener("beforeunload", () =>
  sessionStorage.setItem(
    `${storageKey}-${location.pathname + location.search}`,
    `${scrollX} ${scrollY}`,
  ),
);

export default class Router {
  options: Options;
  routes: [Route, ...Route[]];
  oldRoute: undefined | string;
  private navigation: Navigation;
  private routingVersion = 0;

  constructor(routes: [RouteParam, ...RouteParam[]], options: Options = {}) {
    const newRoutes = compileRoutes(routes, base).map(toRoute) as [
      Route,
      ...Route[],
    ];

    this.routes = newRoutes;
    this.options = options;

    router = this;
    this.navigation = setupNavigation({
      base,
      onNavigate: (url, event, state) =>
        router === this
          ? this.doRouting(url, event, false, state, event.signal)
          : undefined,
      getAnchorState: (anchor) => {
        const data = anchor.getAttribute("data");
        return data === null ? undefined : hydro[replaceBars(data)!];
      },
    });
    history.scrollRestoration = "manual";

    const initialUrl = location.pathname + location.search;
    const initialRoute = this.getMatchingRoute(initialUrl);
    const initialOutlet = $(outletSelector);
    const serverRoute = initialOutlet?.getAttribute("data-router-path");
    const adoptsInitialRoute =
      initialRoute !== undefined &&
      (serverRoute === initialUrl || serverRoute === location.pathname);

    if (adoptsInitialRoute) {
      initialOutlet!.removeAttribute("data-router-path");
    }

    // Prefetch resources
    this.routes.forEach((route) => {
      if (adoptsInitialRoute && initialRoute.chain.includes(route.route)) {
        return;
      }
      // @ts-expect-error
      if (route.templateUrl && !navigator.connection?.saveData) {
        scheduleIdle(() => {
          getTemplate(route.route).catch(async (err) => {
            await this.options.errorHandler?.(err);
          });
        });
      }
    });

    this.doRouting(initialUrl, undefined, adoptsInitialRoute);
    if (
      adoptsInitialRoute ||
      initialRoute?.chain.every((segment) => !segment.templateUrl)
    ) {
      this.oldRoute = initialUrl;
    }
  }

  private getMatchingRoute(path: string): Route | undefined {
    return resolveRoute(this.routes, path) as Route | undefined;
  }

  private finishRouting(routingVersion: number) {
    if (router === this && routingVersion === this.routingVersion) {
      dispatchEvent(new Event("afterRouting"));
    }
  }
  async doRouting(
    to: string = location.pathname + location.search,
    e?: Event,
    adopt = false,
    state?: unknown,
    signal?: AbortSignal,
  ) {
    const routingVersion = ++this.routingVersion;
    const isCurrent = () =>
      router === this &&
      routingVersion === this.routingVersion &&
      !signal?.aborted;
    dispatchEvent(new Event("beforeRouting"));
    const from = this.oldRoute ?? to;
    const route = this.getMatchingRoute(to);
    if (!route) {
      this.finishRouting(routingVersion);
      return;
    }
    {
      const routeStorageKey = `${storageKey}-${to}`;

      // Store position
      if (this.oldRoute) {
        sessionStorage.setItem(
          `${storageKey}-${from}`,
          `${scrollX} ${scrollY}`,
        );
      }

      try {
        const params =
          route.path.exec({ pathname: getRoutePathname(to) })?.pathname.groups ??
          {};
        const allParams = {
          ...Router.getParams(new URL(to, location.href).search),
          ...Object.fromEntries(
            Object.entries(params)
              .filter(
                ([key, value]) =>
                  Number.isNaN(Number(key)) && value !== undefined,
              )
              .map(([key, value]) => [key, decodeURIComponent(value!)]),
          ),
        };
        const navigationState =
          state !== undefined
            ? state
            : this.navigation.currentEntry?.getState();
        const stateObject =
          navigationState !== null && typeof navigationState === "object"
            ? (navigationState as LooseObject)
            : undefined;
        const props = {
          from: from.replace(base, ""),
          to: to.replace(base, ""),
          ...(Object.keys(allParams).length ? { params: allParams } : {}),
          ...(stateObject && Object.keys(stateObject).length
            ? { state: stateObject }
            : {}),
        };

        // Trigger leave
        const currentRoute = this.oldRoute
          ? this.getMatchingRoute(this.oldRoute)
          : undefined;
        if (currentRoute) {
          await currentRoute[cycles.leave]?.(props);
          if (!isCurrent()) return;
        }

        // Trigger beforeEnter
        await route[cycles.beforeEnter]?.(props);
        if (!isCurrent()) return;

        if (!adopt) {
          await renderRoute(
            route,
            currentRoute,
            $(outletSelector)!,
            isCurrent,
            this.options.viewTransitions,
          );
          if (!isCurrent()) return;
        }
        // Trigger afterEnter
        await route[cycles.afterEnter]?.(props);
        if (!isCurrent()) return;
        this.oldRoute = to;
      } catch (err) {
        if (this.options.errorHandler) {
          await this.options.errorHandler(err, e);
        } else {
          console.error(err, e);
        }
      } finally {
        if (!isCurrent()) return;

        // Reload -> restore scroll position
        if (route.restoreScroll && sessionStorage.getItem(routeStorageKey)) {
          const [left, top] = sessionStorage
            .getItem(routeStorageKey)!
            .split(" ")
            .map(Number);
          sessionStorage.removeItem(routeStorageKey);
          scrollTo({
            top,
            left,
            behavior: this.options.scrollBehavior || "auto",
          });
        } else {
          // Reset Scroll, just like Browser
          if (!window.isHMR) {
            scrollTo({
              top: 0,
              left: 0,
              behavior: this.options.scrollBehavior || "auto",
            });
          }
        }

        this.finishRouting(routingVersion);
      }
    }
  }

  go(path: string, state: LooseObject = {}, params = "") {
    const newPath = base + path + params;

    // Only navigate when the path differs
    if (newPath !== location.pathname + location.search) {
      void this.navigation
        .navigate(newPath, { state: { ...state } })
        .finished?.catch(() => {});
    }
  }

  removeRoute(path: string) {
    const target = this.routes.find(
      (route) => route.pathname === getCompiledPathname(path),
    );
    if (!target) return;
    for (let index = this.routes.length - 1; index >= 0; index--) {
      if (this.routes[index].chain.includes(target.route)) {
        this.routes.splice(index, 1);
      }
    }
  }

  addRoute(route: RouteParam) {
    this.routes.push(...compileRoutes([route], base).map(toRoute));
  }

  modifyRoute(path: string, newRoute: RouteParam) {
    const target = this.routes.find(
      (route) => route.pathname === getCompiledPathname(path),
    );
    if (!target) return;
    const descendantIndexes = this.routes.flatMap((route, index) =>
      route.chain.includes(target.route) ? [index] : [],
    );
    this.routes.splice(
      descendantIndexes[0],
      descendantIndexes.length,
      ...compileRoutes([newRoute], base).map(toRoute),
    );
  }

  changeOptions(options: Options) {
    this.options = options;
  }

  static getParams(search = location.search) {
    return Object.fromEntries(new URLSearchParams(search));
  }
}

function handleFormEvent(e: SubmitEvent) {
  if (!router?.options.formHandler || !(e.target instanceof HTMLFormElement)) {
    return;
  }
  e.preventDefault();

  const form = e.target;
  const action = form.action;
  const method = form.method.toUpperCase();

  fetch(action, {
    method,
    ...(!["HEAD", "GET"].includes(method)
      ? { body: new FormData(form) }
      : {}),
    ...router.options.fetchOptions,
  })
    .then((res) => router.options.formHandler!(res, e))
    .catch(async (err) => {
      if (router.options.errorHandler) {
        await router.options.errorHandler(err, e);
      } else {
        console.error(err, e);
      }
    });
}

function replaceBars(hydroTerm: string | null) {
  if (hydroTerm === null || !hydroTerm.includes("{{")) return hydroTerm;

  const [_, hydroPath] = hydroTerm.match(reactivityRegex) || [];
  return hydroPath;
}

function toRoute(resolved: ResolvedRoute<RouteParam>): Route {
  return {
    restoreScroll: true,
    ...resolved.route,
    ...resolved,
    originalPath: resolved.pathname,
  };
}

function getCompiledPathname(path: string) {
  return compileRoutes([{ path }], base)[0].pathname;
}

document.addEventListener("submit", handleFormEvent);

async function renderRoute(
  route: Route,
  currentRoute: Route | undefined,
  where: Element,
  isCurrent: () => boolean,
  viewTransitions = false,
) {
  let sharedSegments = 0;
  while (
    currentRoute?.chain[sharedSegments] === route.chain[sharedSegments] &&
    sharedSegments < route.chain.length
  ) {
    sharedSegments++;
  }
  if (sharedSegments === route.chain.length) sharedSegments--;

  for (let index = 0; index < sharedSegments; index++) {
    const nestedOutlet = where.querySelector(outletSelector);
    if (!nestedOutlet) break;
    where = nestedOutlet;
  }
  const routeChain = route.chain.slice(sharedSegments);
  const templates = await Promise.all(
    routeChain.map(async (segment) =>
      segment.templateUrl
        ? window.isHMR
          ? (await fetch(segment.templateUrl)).text()
          : getTemplate(segment)
        : segment.element,
    ),
  );
  if (!isCurrent()) return;

  const copy = where.cloneNode() as Element;
  let outlet = copy;
  for (let index = 0; index < routeChain.length; index++) {
    const content = templates[index];
    if (content !== undefined) outlet.append(html`${content}`);
    if (index === routeChain.length - 1) continue;
    const nestedOutlet = outlet.querySelector(outletSelector);
    if (!nestedOutlet) {
      throw new Error(
        `Route ${route.pathname} needs a nested ${outletSelector}`,
      );
    }
    nestedOutlet.replaceChildren();
    outlet = nestedOutlet;
  }

  if (!viewTransitions || !document.startViewTransition) {
    render(copy, where, false);
    return;
  }

  const transition = document.startViewTransition(() => {
    if (isCurrent()) render(copy, where, false);
  });
  void transition.ready.catch(() => {});
  await transition.updateCallbackDone;
}

function getTemplate(route: RouteParam): Promise<string> {
  let cache = fetchCache.get(route);
  if (cache?.html !== undefined) return Promise.resolve(cache.html);

  if (!cache) {
    cache = {};
    fetchCache.set(route, cache);
  }
  if (!cache.promise) {
    cache.promise = fetch(route.templateUrl!)
      .then((response) => response.text())
      .then((template) => {
        cache!.html = template;
        return template;
      })
      .finally(() => {
        Reflect.deleteProperty(cache!, "promise");
      });
  }
  return cache.promise;
}

const enum cycles {
  leave = "leave",
  beforeEnter = "beforeEnter",
  afterEnter = "afterEnter",
}
interface RouteBasic {
  templateUrl?: string;
  element?: Node | string;
  [cycles.leave]?(routingProps: RoutingProps): Promise<any> | void;
  [cycles.beforeEnter]?(routingProps: RoutingProps): Promise<any> | void;
  [cycles.afterEnter]?(routingProps: RoutingProps): Promise<any> | void;
  restoreScroll?: boolean;
}
export interface RouteParam extends RouteBasic, RouteDefinition {
  path: string;
  children?: RouteParam[];
}
interface Route extends RouteBasic, ResolvedRoute<RouteParam> {
  originalPath: string;
}
interface Options {
  errorHandler?(err: unknown, e?: Event): Promise<any> | void;
  formHandler?(res: Response, e: Event): Promise<any> | void;
  scrollBehavior?: ScrollBehavior;
  fetchOptions?: RequestInit;
  viewTransitions?: boolean;
}
interface RoutingProps {
  from: string;
  to: string;
  state?: LooseObject;
  params?: LooseObject;
}
type LooseObject = Record<keyof any, any>;
type Cache = {
  promise?: Promise<string>;
  html?: string;
};
