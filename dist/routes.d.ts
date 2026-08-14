export interface RoutePattern {
    exec(input: {
        pathname: string;
    }): RoutePatternResult | null;
}
export interface RoutePatternResult {
    pathname: {
        groups: Record<string, string | undefined>;
    };
}
export interface RoutePatternConstructor {
    new (input: {
        pathname: string;
    }): RoutePattern;
}
export interface RouteDefinition {
    path: string;
    children?: RouteDefinition[];
}
export type RouteMatcherFactory = (pathname: string) => RoutePattern;
export interface ResolvedRoute<T extends RouteDefinition = RouteDefinition> {
    route: T;
    chain: T[];
    path: RoutePattern;
    pathname: string;
}
export declare function compileRoutes<T extends RouteDefinition>(routes: readonly T[], base?: string, matcherFactory?: RouteMatcherFactory): ResolvedRoute<T>[];
export declare function resolveRoute<T extends RouteDefinition>(routes: readonly ResolvedRoute<T>[], url: string): ResolvedRoute<T> | undefined;
export declare function matchResolvedRoute<T extends RouteDefinition>(route: ResolvedRoute<T>, pathname: string): RoutePatternResult | undefined;
export declare function createURLPatternMatcher(pathname: string): RoutePattern;
export declare function getRoutePathname(url: string): string;
export declare function joinRoutePaths(parent: string, child: string): string;
