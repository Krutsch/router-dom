export default class Router {
    options: Options;
    routes: [Route, ...Route[]];
    oldRoute: undefined | string;
    constructor(routes: [RouteParam, ...RouteParam[]], options?: Options);
    private doRouting;
    go(path: string, state: LooseObject, params?: string): void;
    removeRoute(path: string): void;
    addRoute(route: RouteParam): void;
    modifyRoute(path: string, newRoute: RouteParam): void;
    changeOptions(options: Options): void;
    getParams(search?: string): {
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
    element?: Node;
    [cycles.leave]?(routingProps: RoutingProps): Promise<any> | void;
    [cycles.beforeEnter]?(routingProps: RoutingProps): Promise<any> | void;
    [cycles.afterEnter]?(routingProps: RoutingProps): Promise<any> | void;
}
interface RouteParam extends RouteBasic {
    path: string;
}
interface Route extends RouteBasic {
    path: RegExp;
    originalPath: string;
}
interface Options {
    errorHandler?(err: Error, e?: PopStateEvent | Event): Promise<any> | void;
    formHandler?(res: Response, e: Event): Promise<any> | void;
}
interface RoutingProps {
    from: string;
    to: string;
    state: LooseObject;
    params?: LooseObject;
}
declare type LooseObject = Record<keyof any, any>;
export {};
