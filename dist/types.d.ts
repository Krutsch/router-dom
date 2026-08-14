import type { ResolvedRoute, RouteDefinition } from "./routes.js";
export interface RouteBasic {
    templateUrl?: string;
    element?: Node | string;
    leave?(routingProps: RoutingProps): Promise<any> | void;
    beforeEnter?(routingProps: RoutingProps): Promise<any> | void;
    afterEnter?(routingProps: RoutingProps): Promise<any> | void;
    restoreScroll?: boolean;
}
export interface RouteParam extends RouteBasic, RouteDefinition {
    path: string;
    children?: RouteParam[];
}
export interface Route extends RouteBasic, ResolvedRoute<RouteParam> {
    originalPath: string;
}
export interface RouterOptions {
    errorHandler?(err: unknown, e?: PopStateEvent | Event): Promise<any> | void;
    formHandler?(res: Response, e: Event): Promise<any> | void;
    scrollBehavior?: ScrollBehavior;
    fetchOptions?: RequestInit;
    viewTransitions?: boolean;
}
export interface RoutingProps {
    from: string;
    to: string;
    state?: LooseObject;
    params?: LooseObject;
}
export type LooseObject = Record<keyof any, any>;
