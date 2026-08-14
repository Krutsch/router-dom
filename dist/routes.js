import { match as pathToRegexpMatch, pathToRegexp } from "path-to-regexp";
const optionalParamRegex = /\/:([A-Za-z_$][\w$]*)\?/g;
const optionalTrailingSlashRegex = /\{\/\}\?/g;
const unnamedWildcardRegex = /\/\*$/;
const legacyQueryRegex = /\(\\\?\)\?\(\.\*\)$/;
const routeMatchers = new WeakMap();
const matchersByRegexp = new WeakMap();
export function compileRoutes(routes, base = "", matcherFactory = createPathToRegexpMatcher) {
    return routes.flatMap((route) => compileRoute(route, [], base, matcherFactory));
}
export function resolveRoute(routes, url) {
    const pathname = getRoutePathname(url);
    return routes.find((route) => {
        const matcher = routeMatchers.get(route) || matchersByRegexp.get(route.path);
        return matcher?.matches
            ? matcher.matches(pathname)
            : route.path.test(pathname);
    });
}
export function matchResolvedRoute(route, pathname) {
    const matcher = routeMatchers.get(route) ||
        matchersByRegexp.get(route.path) ||
        createPathToRegexpMatcher(route.pathname);
    return matcher.match(pathname);
}
export function createPathToRegexpMatcher(pathname) {
    const routeMatcher = pathToRegexpMatch(pathname, {
        decode: decodeURIComponent,
    });
    const regexp = pathToRegexp(pathname).regexp;
    return {
        match(path) {
            const result = routeMatcher(path);
            if (!result)
                return;
            return {
                path: result.path,
                params: result.params,
            };
        },
        matches(path) {
            return regexp.test(path);
        },
        regexp,
    };
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
    const matcher = matcherFactory(normalizedPathname);
    const resolved = {
        route,
        chain,
        path: matcher.regexp || pathToRegexp(normalizedPathname).regexp,
        pathname: normalizedPathname,
    };
    routeMatchers.set(resolved, matcher);
    matchersByRegexp.set(resolved.path, matcher);
    return [
        ...children.flatMap((child) => compileRoute(child, chain, pathname, matcherFactory)),
        resolved,
    ];
}
function normalizeRoutePath(path) {
    return path
        .replace(legacyQueryRegex, "")
        .replace(optionalTrailingSlashRegex, "{/}")
        .replace(unnamedWildcardRegex, "/*splat")
        .replace(optionalParamRegex, "{/:$1}");
}
function normalizeSlashes(path) {
    const normalized = path.replace(/\/{2,}/g, "/");
    return normalized || "/";
}
