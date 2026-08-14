import {
  getRoutePathname,
  matchResolvedRoute,
  type ResolvedRoute,
} from "./routes.js";
import type { BrowserPlatform } from "./browser.js";
import type { RouteRegistry } from "./registry.js";
import type { RouteRenderer } from "./renderer.js";
import type {
  LooseObject,
  Route,
  RouteParam,
  RouterOptions,
  RoutingProps,
} from "./types.js";

export class RouteOrchestrator {
  oldRoute: undefined | string;

  private routingVersion = 0;

  constructor(
    private readonly registry: RouteRegistry<RouteParam>,
    private readonly renderer: RouteRenderer,
    private readonly platform: BrowserPlatform,
    private readonly getOptions: () => RouterOptions,
  ) {}

  async doRouting(
    to = this.platform.currentUrl(),
    event?: Event,
    adopt = false,
    state?: unknown,
    signal?: AbortSignal,
  ) {
    const routingVersion = ++this.routingVersion;
    const isCurrent = () =>
      routingVersion === this.routingVersion && !signal?.aborted;
    this.platform.dispatch("beforeRouting");
    const from = this.oldRoute ?? to;
    const route = this.getMatchingRoute(to);
    if (!route) {
      this.finishRouting(routingVersion, isCurrent);
      return;
    }

    if (this.oldRoute) this.platform.saveScroll(from);

    try {
      const routeMatch = matchResolvedRoute(route, getRoutePathname(to));
      const routeParams = routeMatch?.pathname.groups ?? {};
      const allParams = {
        ...getParams(new URL(to, this.platform.currentHref()).search),
        ...Object.fromEntries(
          Object.entries(routeParams)
            .filter(
              ([key, value]) =>
                Number.isNaN(Number(key)) && value !== undefined,
            )
            .map(([key, value]) => [key, decodeURIComponent(value!)]),
        ),
      };
      const navigationState =
        state !== undefined ? state : this.platform.currentState();
      const stateObject =
        navigationState !== null && typeof navigationState === "object"
          ? (navigationState as LooseObject)
          : undefined;
      const props: RoutingProps = {
        from: from.replace(this.platform.base, ""),
        to: to.replace(this.platform.base, ""),
        ...(Object.keys(allParams).length ? { params: allParams } : {}),
        ...(stateObject && Object.keys(stateObject).length
          ? { state: stateObject }
          : {}),
      };

      const currentRoute = this.oldRoute
        ? this.getMatchingRoute(this.oldRoute)
        : undefined;
      await currentRoute?.leave?.(props);
      if (!isCurrent()) return;

      await route.beforeEnter?.(props);
      if (!isCurrent()) return;

      if (!adopt || route.restoreScroll === false) {
        await this.renderer.render(
          route,
          currentRoute,
          this.platform.outlet()!,
          isCurrent,
          this.getOptions().viewTransitions,
        );
        if (!isCurrent()) return;
      }

      await route.afterEnter?.(props);
      if (!isCurrent()) return;
      this.oldRoute = to;
    } catch (error) {
      if (signal?.aborted) return;
      const options = this.getOptions();
      if (options.errorHandler) {
        await options.errorHandler(error, event);
      } else {
        console.error(error, event);
      }
    } finally {
      if (!isCurrent()) return;
      if (!adopt) {
        this.platform.finishScroll(
          to,
          route.restoreScroll ?? true,
          this.getOptions().scrollBehavior,
        );
      }
      this.finishRouting(routingVersion, isCurrent);
    }
  }

  prefetch(
    routes: readonly ResolvedRoute<RouteParam>[],
    initialRoute: ResolvedRoute<RouteParam> | undefined,
    adoptsInitialRoute: boolean,
  ) {
    routes.forEach((resolvedRoute) => {
      if (
        adoptsInitialRoute &&
        initialRoute?.chain.includes(resolvedRoute.route)
      ) {
        return;
      }
      const route = toRoute(resolvedRoute);
      if (!route.templateUrl || !this.platform.shouldPrefetch()) return;

      this.platform.scheduleIdle(() => {
        void this.renderer.prefetch(route).catch(async (error) => {
          await this.getOptions().errorHandler?.(error);
        });
      });
    });
  }

  private getMatchingRoute(path: string): Route | undefined {
    const resolved = this.registry.resolve(path);
    return resolved ? toRoute(resolved) : undefined;
  }

  private finishRouting(routingVersion: number, isCurrent: () => boolean) {
    if (routingVersion === this.routingVersion && isCurrent()) {
      this.platform.dispatch("afterRouting");
    }
  }
}

function toRoute(resolved: ResolvedRoute<RouteParam>): Route {
  return Object.freeze({
    restoreScroll: true,
    ...resolved.route,
    ...resolved,
    chain: Object.freeze(resolved.chain.slice()) as unknown as RouteParam[],
    originalPath: resolved.pathname,
  }) as Route;
}

function getParams(search: string) {
  return Object.fromEntries(new URLSearchParams(search));
}
