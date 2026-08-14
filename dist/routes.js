const legacyQueryRegex = /\(\\\?\)\?\(\.\*\)$/;
export function compileRoutes(routes, base = "", matcherFactory = createURLPatternMatcher) {
    return routes.flatMap((route) => compileRoute(route, [], base, matcherFactory));
}
export function resolveRoute(routes, url) {
    const pathname = getRoutePathname(url);
    return routes.find((route) => route.path.exec({ pathname }));
}
export function matchResolvedRoute(route, pathname) {
    return route.path.exec({ pathname }) ?? undefined;
}
export function createURLPatternMatcher(pathname) {
    const URLPatternConstructor = globalThis.URLPattern;
    if (!URLPatternConstructor) {
        throw new Error("router-dom requires URLPattern");
    }
    return new URLPatternConstructor({ pathname });
}
export function getRoutePathname(url) {
    if (url.startsWith("."))
        url = url.slice(1);
    return url.split(/[?#]/, 1)[0] || "/";
}
export function joinRoutePaths(parent, child) {
    if (!parent || parent === "/")
        return normalizeSlashes(`/${child}`);
    return normalizeSlashes(`${parent}/${child}`);
}
function compileRoute(route, parents, parentPath, matcherFactory) {
    const pathname = parents.length
        ? joinRoutePaths(parentPath, route.path)
        : normalizeSlashes(`${parentPath}${route.path}`);
    const chain = [...parents, route];
    const children = (route.children ?? []);
    const normalizedPathname = normalizeRoutePath(pathname);
    const resolved = {
        route,
        chain,
        path: matcherFactory(normalizedPathname),
        pathname: normalizedPathname,
    };
    return [
        ...children.flatMap((child) => compileRoute(child, chain, pathname, matcherFactory)),
        resolved,
    ];
}
function normalizeRoutePath(path) {
    return path.replace(legacyQueryRegex, "");
}
function normalizeSlashes(path) {
    const normalized = path.replace(/\/{2,}/g, "/");
    return normalized || "/";
}
