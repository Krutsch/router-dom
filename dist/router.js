import { attachBrowserShell, createBrowserPlatform } from "./browser.js";
import { RouteRegistry } from "./registry.js";
import { createHydroRenderAdapter, createTemplateLoader, RouteRenderer, } from "./renderer.js";
import { RouteOrchestrator } from "./routing.js";
export { compileRoutes, resolveRoute } from "./routes.js";
export default class Router {
    options;
    platform = createBrowserPlatform();
    routeRegistry;
    orchestrator;
    constructor(routes, options = {}) {
        this.routeRegistry = new RouteRegistry(routes, this.platform.base);
        this.options = options;
        this.platform.setNativeScrollRestoration();
        const initialUrl = this.platform.currentUrl();
        const initialRoute = this.routeRegistry.resolve(initialUrl);
        const initialOutlet = this.platform.outlet();
        const serverRoute = initialOutlet?.getAttribute("data-router-path");
        const adoptsInitialRoute = initialRoute !== undefined &&
            (serverRoute === initialUrl || serverRoute === location.pathname);
        if (adoptsInitialRoute) {
            this.platform.removeServerRouteMarker(initialOutlet);
        }
        const templates = createTemplateLoader((input, init) => this.platform.fetch(input, init), () => this.platform.isHMR());
        const renderer = new RouteRenderer(templates, createHydroRenderAdapter(this.platform.document));
        this.orchestrator = new RouteOrchestrator(this.routeRegistry, renderer, this.platform, () => this.options);
        attachBrowserShell(this, this.platform);
        this.orchestrator.prefetch(this.routeRegistry.routes, initialRoute, adoptsInitialRoute);
        void this.doRouting(initialUrl, undefined, adoptsInitialRoute, true);
        if (adoptsInitialRoute ||
            initialRoute?.chain.every((segment) => !segment.templateUrl)) {
            this.orchestrator.oldRoute = initialUrl;
        }
    }
    get routes() {
        const routes = this.routeRegistry.snapshot.map(toRoute);
        return Object.freeze(routes);
    }
    get oldRoute() {
        return this.orchestrator.oldRoute;
    }
    set oldRoute(value) {
        this.orchestrator.oldRoute = value ?? undefined;
    }
    doRouting(to = this.platform.currentUrl(), event, adopt = false, preserveScroll = false) {
        return this.orchestrator.doRouting(to, event, adopt, preserveScroll);
    }
    go(path, state = {}, params = "") {
        const newPath = this.platform.base + path + params;
        if (newPath !== this.platform.currentUrl()) {
            this.platform.setManualScrollRestoration();
            this.platform.push(newPath, state);
            void this.doRouting(newPath);
        }
    }
    removeRoute(path) {
        this.routeRegistry.removeRoute(path);
    }
    addRoute(route) {
        this.routeRegistry.addRoute(route);
    }
    modifyRoute(path, newRoute) {
        this.routeRegistry.modifyRoute(path, newRoute);
    }
    changeOptions(options) {
        this.options = options;
    }
    static getParams(search = location.search) {
        return Object.fromEntries(new URLSearchParams(search));
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
