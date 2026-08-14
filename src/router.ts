import { hydro } from "hydro-js";
import {
  compileRoutes,
  resolveRoute,
  type ResolvedRoute,
} from "./routes.js";
import { attachBrowserShell, createBrowserPlatform } from "./browser.js";
import { setupNavigation } from "./navigation.js";
import { RouteRegistry } from "./registry.js";
import {
  createHydroRenderAdapter,
  createTemplateLoader,
  RouteRenderer,
} from "./renderer.js";
import { RouteOrchestrator } from "./routing.js";
import type {
  LooseObject,
  Route,
  RouteParam,
  RouterOptions,
} from "./types.js";

export { compileRoutes, resolveRoute } from "./routes.js";
export type { RouteParam } from "./types.js";

export default class Router {
  options: Options;

  private readonly platform = createBrowserPlatform();
  private readonly routeRegistry: RouteRegistry<RouteParam>;
  private readonly orchestrator: RouteOrchestrator;
  private readonly navigation: Navigation;

  constructor(routes: [RouteParam, ...RouteParam[]], options: Options = {}) {
    this.routeRegistry = new RouteRegistry(routes, this.platform.base);
    this.options = options;
    this.platform.setManualScrollRestoration();

    const initialUrl = this.platform.currentUrl();
    const initialRoute = this.routeRegistry.resolve(initialUrl);
    const initialOutlet = this.platform.outlet();
    const serverRoute = initialOutlet?.getAttribute("data-router-path");
    const adoptsInitialRoute =
      initialRoute !== undefined &&
      (serverRoute === initialUrl || serverRoute === location.pathname);

    if (adoptsInitialRoute) {
      this.platform.removeServerRouteMarker(initialOutlet!);
    }

    const templates = createTemplateLoader(
      (input, init) => this.platform.fetch(input, init),
      () => this.platform.isHMR(),
    );
    const renderer = new RouteRenderer(
      templates,
      createHydroRenderAdapter(this.platform.document),
    );
    this.orchestrator = new RouteOrchestrator(
      this.routeRegistry,
      renderer,
      this.platform,
      () => this.options,
    );

    this.navigation = setupNavigation({
      base: this.platform.base,
      onNavigate: (url, event, state) =>
        this.doRouting(url, event, false, state, event.signal),
      getAnchorState: (anchor) => {
        const data = anchor.getAttribute("data");
        if (data === null) return undefined;
        const [_, hydroPath] = data.match(/\{\{([^]*?)\}\}/) || [];
        return hydro[hydroPath || data];
      },
    });

    attachBrowserShell(this, this.platform);
    this.orchestrator.prefetch(
      this.routeRegistry.routes,
      initialRoute,
      adoptsInitialRoute,
    );
    void this.doRouting(
      initialUrl,
      undefined,
      adoptsInitialRoute,
      this.navigation.currentEntry?.getState(),
    );
    if (
      adoptsInitialRoute ||
      initialRoute?.chain.every((segment) => !segment.templateUrl)
    ) {
      this.orchestrator.oldRoute = initialUrl;
    }
  }

  get routes(): readonly [Route, ...Route[]] {
    const routes = this.routeRegistry.snapshot.map(toRoute) as [
      Route,
      ...Route[],
    ];
    return Object.freeze(routes);
  }

  get oldRoute(): undefined | string {
    return this.orchestrator.oldRoute;
  }

  set oldRoute(value: undefined | string | null) {
    this.orchestrator.oldRoute = value ?? undefined;
  }

  doRouting(
    to = this.platform.currentUrl(),
    event?: Event,
    adopt = false,
    state?: unknown,
    signal?: AbortSignal,
  ) {
    return this.orchestrator.doRouting(to, event, adopt, state, signal);
  }

  go(path: string, state: LooseObject = {}, params = "") {
    const newPath = this.platform.base + path + params;

    if (newPath !== this.platform.currentUrl()) {
      void this.navigation
        .navigate(newPath, { state: { ...state } })
        .finished?.catch(() => {})
        .catch(() => {});
    }
  }

  removeRoute(path: string) {
    this.routeRegistry.removeRoute(path);
  }

  addRoute(route: RouteParam) {
    this.routeRegistry.addRoute(route);
  }

  modifyRoute(path: string, newRoute: RouteParam) {
    this.routeRegistry.modifyRoute(path, newRoute);
  }

  changeOptions(options: Options) {
    this.options = options;
  }

  static getParams(search = location.search) {
    return Object.fromEntries(new URLSearchParams(search));
  }
}

export interface Options extends RouterOptions {}

function toRoute(resolved: ResolvedRoute<RouteParam>): Route {
  return Object.freeze({
    restoreScroll: true,
    ...resolved.route,
    ...resolved,
    chain: Object.freeze(resolved.chain.slice()) as unknown as RouteParam[],
    originalPath: resolved.pathname,
  }) as Route;
}
