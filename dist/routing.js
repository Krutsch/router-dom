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
    async doRouting(to = this.platform.currentUrl(), event, adopt = false, state, signal, preserveScroll = false) {
        const routingVersion = ++this.routingVersion;
        const isCurrent = () => routingVersion === this.routingVersion && !signal?.aborted;
        this.platform.dispatch("beforeRouting");
        const from = this.oldRoute ?? to;
        const route = this.getMatchingRoute(to);
        if (!route) {
            this.finishRouting(routingVersion, isCurrent);
            return;
        }
        try {
            const routeMatch = matchResolvedRoute(route, getRoutePathname(to));
            const routeParams = routeMatch?.pathname.groups ?? {};
            const allParams = {
                ...getParams(new URL(to, this.platform.currentHref()).search),
                ...Object.fromEntries(Object.entries(routeParams)
                    .filter(([key, value]) => Number.isNaN(Number(key)) && value !== undefined)
                    .map(([key, value]) => [key, decodeURIComponent(value)])),
            };
            const navigationState = state !== undefined ? state : this.platform.currentState();
            const stateObject = navigationState !== null && typeof navigationState === "object"
                ? navigationState
                : undefined;
            const props = {
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
            if (!isCurrent())
                return;
            await route.beforeEnter?.(props);
            if (!isCurrent())
                return;
            if (!adopt || route.restoreScroll === false) {
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
            if (signal?.aborted)
                return;
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
            else if (!adopt) {
                this.platform.finishScroll(route.restoreScroll ?? true, event?.navigationType === "traverse", this.getOptions().scrollBehavior);
            }
            this.finishRouting(routingVersion, isCurrent);
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
    finishRouting(routingVersion, isCurrent) {
        if (routingVersion === this.routingVersion && isCurrent()) {
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
