import { type ResolvedRoute, type RouteDefinition, type RouteMatcherFactory } from "./routes.js";
export declare class RouteRegistry<T extends RouteDefinition> {
    private readonly base;
    private readonly matcherFactory;
    private entries;
    constructor(routes: readonly T[], base?: string, matcherFactory?: RouteMatcherFactory);
    get routes(): readonly ResolvedRoute<T>[];
    get snapshot(): readonly ResolvedRoute<T>[];
    resolve(url: string): ResolvedRoute<T> | undefined;
    addRoute(route: T): void;
    removeRoute(path: string): void;
    modifyRoute(path: string, newRoute: T): void;
    private findByPath;
}
