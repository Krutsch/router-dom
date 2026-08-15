import { type ResolvedRoute } from "./routes.js";
import type { BrowserPlatform } from "./browser.js";
import type { RouteRegistry } from "./registry.js";
import type { RouteRenderer } from "./renderer.js";
import type { RouteParam, RouterOptions } from "./types.js";
export declare class RouteOrchestrator {
    private readonly registry;
    private readonly renderer;
    private readonly platform;
    private readonly getOptions;
    oldRoute: undefined | string;
    private routingVersion;
    constructor(registry: RouteRegistry<RouteParam>, renderer: RouteRenderer, platform: BrowserPlatform, getOptions: () => RouterOptions);
    doRouting(to?: string, event?: PopStateEvent, adopt?: boolean, preserveScroll?: boolean): Promise<void>;
    prefetch(routes: readonly ResolvedRoute<RouteParam>[], initialRoute: ResolvedRoute<RouteParam> | undefined, adoptsInitialRoute: boolean): void;
    private getMatchingRoute;
    private finishRouting;
}
