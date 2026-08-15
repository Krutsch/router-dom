import type { Route, RouteParam, RouterOptions, LooseObject } from "./types.js";
export { compileRoutes, resolveRoute } from "./routes.js";
export type { RouteParam } from "./types.js";
export default class Router {
    options: Options;
    private readonly platform;
    private readonly routeRegistry;
    private readonly orchestrator;
    constructor(routes: [RouteParam, ...RouteParam[]], options?: Options);
    get routes(): readonly [Route, ...Route[]];
    get oldRoute(): undefined | string;
    set oldRoute(value: undefined | string | null);
    doRouting(to?: string, event?: PopStateEvent, adopt?: boolean, preserveScroll?: boolean): Promise<void>;
    go(path: string, state?: LooseObject, params?: string): void;
    removeRoute(path: string): void;
    addRoute(route: RouteParam): void;
    modifyRoute(path: string, newRoute: RouteParam): void;
    changeOptions(options: Options): void;
    static getParams(search?: string): {
        [k: string]: string;
    };
}
export interface Options extends RouterOptions {
}
