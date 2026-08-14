import { compileRoutes, resolveRoute, type ResolvedRoute } from "./routes.js";
import { attachBrowserShell, createBrowserPlatform } from "./browser.js";
import { RouteRegistry } from "./registry.js";
import {
  createHydroRenderAdapter,
  createTemplateLoader,
  RouteRenderer,
} from "./renderer.js";
import { RouteOrchestrator } from "./routing.js";
import type { Route, RouteParam, RouterOptions, LooseObject } from "./types.js";

export { compileRoutes, resolveRoute } from "./routes.js";
export type { RouteParam } from "./types.js";

export default class Router {
  options: Options;

  private readonly platform = createBrowserPlatform();
  private readonly routeRegistry: RouteRegistry<RouteParam>;
  private readonly orchestrator: RouteOrchestrator;

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

    attachBrowserShell(this, this.platform);
    this.orchestrator.prefetch(
      this.routeRegistry.routes,
      initialRoute,
      adoptsInitialRoute,
    );
    void this.doRouting(initialUrl, undefined, adoptsInitialRoute);
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
    event?: PopStateEvent,
    adopt = false,
  ) {
    return this.orchestrator.doRouting(to, event, adopt);
  }

  go(path: string, state: LooseObject = {}, params = "") {
    const newPath = this.platform.base + path + params;

    if (newPath !== this.platform.currentUrl()) {
      this.platform.push(newPath, state);
      void this.doRouting(newPath);
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
