import { compileRoutes, createPathToRegexpMatcher, resolveRoute, } from "./routes.js";
export class RouteRegistry {
    base;
    matcherFactory;
    entries;
    constructor(routes, base = "", matcherFactory = createPathToRegexpMatcher) {
        this.base = base;
        this.matcherFactory = matcherFactory;
        this.entries = compileRoutes(routes, base, matcherFactory);
    }
    get routes() {
        return this.entries;
    }
    get snapshot() {
        const clones = new WeakMap();
        return Object.freeze(this.entries.map((entry) => {
            const chain = entry.chain.map((route) => cloneRouteDefinition(route, clones));
            return Object.freeze({
                ...entry,
                path: new RegExp(entry.path.source, entry.path.flags),
                route: chain[chain.length - 1] ||
                    cloneRouteDefinition(entry.route, clones),
                chain: Object.freeze(chain),
            });
        }));
    }
    resolve(url) {
        return resolveRoute(this.entries, url);
    }
    addRoute(route) {
        this.entries.push(...compileRoutes([route], this.base, this.matcherFactory));
    }
    removeRoute(path) {
        const target = this.findByPath(path);
        if (!target)
            return;
        this.entries = this.entries.filter((route) => !route.chain.includes(target.route));
    }
    modifyRoute(path, newRoute) {
        const target = this.findByPath(path);
        if (!target)
            return;
        const indexes = this.entries.flatMap((route, index) => route.chain.includes(target.route) ? [index] : []);
        const firstIndex = indexes[0];
        const lastIndex = indexes[indexes.length - 1];
        const replacement = compileRoutes([newRoute], this.base, this.matcherFactory);
        this.entries = [
            ...this.entries.slice(0, firstIndex),
            ...replacement,
            ...this.entries.slice(lastIndex + 1),
        ];
    }
    findByPath(path) {
        const compiledPath = compileRoutes([{ path }], this.base, this.matcherFactory)[0].pathname;
        return this.entries.find((route) => route.pathname === compiledPath);
    }
}
function cloneRouteDefinition(route, clones) {
    const existing = clones.get(route);
    if (existing)
        return existing;
    const clone = { ...route };
    clones.set(route, clone);
    if (route.children) {
        clone.children = Object.freeze(route.children.map((child) => cloneRouteDefinition(child, clones)));
    }
    return Object.freeze(clone);
}
