import { getRoutePathname, matchResolvedRoute, } from "./routes.js";
export class RouteOrchestrator {
    registry;
    renderer;
    platform;
    getOptions;
    oldRoute;
    routingVersion = 0;
    constructor(registry, renderer, platform, getOptions) {
        this.registry = registry;
        this.renderer = renderer;
        this.platform = platform;
        this.getOptions = getOptions;
    }
    async doRouting(to = this.platform.currentUrl(), event, adopt = false, preserveScroll = false) {
        const routingVersion = ++this.routingVersion;
        const isCurrent = () => routingVersion === this.routingVersion;
        this.platform.dispatch("beforeRouting");
        const from = this.oldRoute ?? to;
        const route = this.getMatchingRoute(to);
        const isHMRUpdate = this.platform.isHMR() &&
            event !== undefined &&
            !(event instanceof PopStateEvent);
        if (!route) {
            this.finishRouting(routingVersion);
            return;
        }
        try {
            const routeMatch = matchResolvedRoute(route, getRoutePathname(to));
            const allParams = {
                ...getParams(new URL(to, this.platform.currentHref()).search),
                ...Object.fromEntries(Object.entries(routeMatch?.params || {}).filter(([key]) => Number.isNaN(Number(key)))),
            };
            const props = {
                from: from.replace(this.platform.base, ""),
                to: to.replace(this.platform.base, ""),
                ...(Object.keys(allParams).length ? { params: allParams } : {}),
                ...(this.platform.currentState()
                    ? { state: this.platform.currentState() }
                    : {}),
            };
            const currentRoute = this.oldRoute
                ? this.getMatchingRoute(this.oldRoute)
                : undefined;
            await currentRoute?.leave?.(props);
            if (!isCurrent())
                return;
            await route.beforeEnter?.(props);
            if (!isCurrent())
                return;
            if (!adopt) {
                await this.renderer.render(route, currentRoute, this.platform.outlet(), isCurrent, this.getOptions().viewTransitions);
                if (!isCurrent())
                    return;
            }
            await route.afterEnter?.(props);
            if (!isCurrent())
                return;
            this.oldRoute = to;
        }
        catch (error) {
            const options = this.getOptions();
            if (options.errorHandler) {
                await options.errorHandler(error, event);
            }
            else {
                console.error(error, event);
            }
        }
        finally {
            if (!isCurrent())
                return;
            if (preserveScroll) {
                this.platform.restoreInitialScroll();
            }
            else if (!adopt && !isHMRUpdate) {
                this.platform.finishScroll(route.restoreScroll ?? true, event instanceof PopStateEvent, this.getOptions().scrollBehavior);
            }
            this.finishRouting(routingVersion);
        }
    }
    prefetch(routes, initialRoute, adoptsInitialRoute) {
        routes.forEach((resolvedRoute) => {
            if (adoptsInitialRoute &&
                initialRoute?.chain.includes(resolvedRoute.route)) {
                return;
            }
            const route = toRoute(resolvedRoute);
            if (!route.templateUrl || !this.platform.shouldPrefetch())
                return;
            this.platform.scheduleIdle(() => {
                void this.renderer.prefetch(route).catch(async (error) => {
                    await this.getOptions().errorHandler?.(error);
                });
            });
        });
    }
    getMatchingRoute(path) {
        const resolved = this.registry.resolve(path);
        return resolved ? toRoute(resolved) : undefined;
    }
    finishRouting(routingVersion) {
        if (routingVersion === this.routingVersion) {
            this.platform.dispatch("afterRouting");
        }
    }
}
function toRoute(resolved) {
    return Object.freeze({
        restoreScroll: true,
        ...resolved.route,
        ...resolved,
        chain: Object.freeze(resolved.chain.slice()),
        originalPath: resolved.pathname,
    });
}
function getParams(search) {
    return Object.fromEntries(new URLSearchParams(search));
}
