export default class Router {
    options: Options;
    routes: [Route, ...Route[]];
    oldRoute: undefined | string;
    constructor(routes: [RouteParam, ...RouteParam[]], options?: Options);
    private triggerEvent;
    go(path: string, state: LooseObject, params?: string): void;
    removeRoute(path: string): void;
    addRoute(route: RouteParam): void;
    modifyRoute(path: string, newRoute: RouteParam): void;
    changeOptions(options: Options): void;
    getParams(): {
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
}
interface Options {
    base?: string;
    errorHandler?(e: Error): Promise<any> | void;
}
interface RoutingProps {
    from: string;
    to: string;
    state: LooseObject;
}
declare type LooseObject = Record<keyof any, any>;
export {};
