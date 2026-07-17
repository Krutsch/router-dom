import { pathToRegexp } from "path-to-regexp";
const optionalParamRegex = /\/:([A-Za-z_$][\w$]*)\?/g;
const legacyQueryRegex = /\(\\\?\)\?\(\.\*\)$/;
export function compileRoutes(routes, base = "") {
    return routes.flatMap((route) => compileRoute(route, [], base));
}
export function resolveRoute(routes, url) {
    const pathname = getRoutePathname(url);
    return routes.find((route) => route.path.exec(pathname));
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
function compileRoute(route, parents, parentPath) {
    const pathname = parents.length
        ? joinRoutePaths(parentPath, route.path)
        : normalizeSlashes(`${parentPath}${route.path}`);
    const chain = [...parents, route];
    const children = (route.children ?? []);
    return [
        ...children.flatMap((child) => compileRoute(child, chain, pathname)),
        {
            route,
            chain,
            path: pathToRegexp(normalizeRoutePath(pathname)).regexp,
            pathname: normalizeRoutePath(pathname),
        },
    ];
}
function normalizeRoutePath(path) {
    return path
        .replace(legacyQueryRegex, "")
        .replace(optionalParamRegex, "{/:$1}");
}
function normalizeSlashes(path) {
    const normalized = path.replace(/\/{2,}/g, "/");
    return normalized || "/";
}
