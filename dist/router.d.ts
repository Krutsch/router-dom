import { type ResolvedRoute, type RouteDefinition } from "./routes.js";
export { compileRoutes, resolveRoute } from "./routes.js";
export default class Router {
    options: Options;
    routes: [Route, ...Route[]];
    oldRoute: undefined | string;
    private routingVersion;
    constructor(routes: [RouteParam, ...RouteParam[]], options?: Options);
    private getMatchingRoute;
    private finishRouting;
    doRouting(to?: string, e?: PopStateEvent, adopt?: boolean): Promise<void>;
    go(path: string, state?: LooseObject, params?: string): void;
    removeRoute(path: string): void;
    addRoute(route: RouteParam): void;
    modifyRoute(path: string, newRoute: RouteParam): void;
    changeOptions(options: Options): void;
    static getParams(search?: string): {
        [k: string]: string;
    };
}
declare const enum cycles {
    leave = "leave",
    beforeEnter = "beforeEnter",
    afterEnter = "afterEnter"
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
    errorHandler?(err: unknown, e?: PopStateEvent | Event): Promise<any> | void;
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
