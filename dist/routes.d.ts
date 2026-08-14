export interface RouteDefinition {
    path: string;
    children?: RouteDefinition[];
}
export type RouteParams = Record<string, string | string[]>;
export interface RouteMatch {
    path: string;
    params: RouteParams;
}
export interface RouteMatcher {
    match(pathname: string): RouteMatch | undefined;
    matches?(pathname: string): boolean;
    regexp?: RegExp;
}
export type RouteMatcherFactory = (pathname: string) => RouteMatcher;
export interface ResolvedRoute<T extends RouteDefinition = RouteDefinition> {
    route: T;
    chain: T[];
    path: RegExp;
    pathname: string;
}
export declare function compileRoutes<T extends RouteDefinition>(routes: readonly T[], base?: string, matcherFactory?: RouteMatcherFactory): ResolvedRoute<T>[];
export declare function resolveRoute<T extends RouteDefinition>(routes: readonly ResolvedRoute<T>[], url: string): ResolvedRoute<T> | undefined;
export declare function matchResolvedRoute<T extends RouteDefinition>(route: ResolvedRoute<T>, pathname: string): RouteMatch | undefined;
export declare function createPathToRegexpMatcher(pathname: string): RouteMatcher;
export declare function getRoutePathname(url: string): string;
export declare function joinRoutePaths(parent: string, child: string): string;
