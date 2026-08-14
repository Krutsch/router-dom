import { match as pathToRegexpMatch, pathToRegexp } from "path-to-regexp";

const optionalParamRegex = /\/:([A-Za-z_$][\w$]*)\?/g;
const optionalTrailingSlashRegex = /\{\/\}\?/g;
const unnamedWildcardRegex = /\/\*$/;
const legacyQueryRegex = /\(\\\?\)\?\(\.\*\)$/;

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

const routeMatchers = new WeakMap<object, RouteMatcher>();
const matchersByRegexp = new WeakMap<RegExp, RouteMatcher>();

export function compileRoutes<T extends RouteDefinition>(
  routes: readonly T[],
  base = "",
  matcherFactory: RouteMatcherFactory = createPathToRegexpMatcher,
): ResolvedRoute<T>[] {
  return routes.flatMap((route) =>
    compileRoute(route, [], base, matcherFactory),
  );
}

export function resolveRoute<T extends RouteDefinition>(
  routes: readonly ResolvedRoute<T>[],
  url: string,
): ResolvedRoute<T> | undefined {
  const pathname = getRoutePathname(url);
  return routes.find((route) => {
    const matcher =
      routeMatchers.get(route) || matchersByRegexp.get(route.path);
    return matcher?.matches
      ? matcher.matches(pathname)
      : route.path.test(pathname);
  });
}

export function matchResolvedRoute<T extends RouteDefinition>(
  route: ResolvedRoute<T>,
  pathname: string,
) {
  const matcher =
    routeMatchers.get(route) ||
    matchersByRegexp.get(route.path) ||
    createPathToRegexpMatcher(route.pathname);
  return matcher.match(pathname);
}

export function createPathToRegexpMatcher(pathname: string): RouteMatcher {
  const routeMatcher = pathToRegexpMatch(pathname, {
    decode: decodeURIComponent,
  });
  const regexp = pathToRegexp(pathname).regexp;

  return {
    match(path: string) {
      const result = routeMatcher(path);
      if (!result) return;

      return {
        path: result.path,
        params: result.params as RouteParams,
      };
    },
    matches(path: string) {
      return regexp.test(path);
    },
    regexp,
  };
}

export function getRoutePathname(url: string): string {
  if (url.startsWith(".")) url = url.slice(1);
  return url.split(/[?#]/, 1)[0] || "/";
}

export function joinRoutePaths(parent: string, child: string): string {
  if (!parent || parent === "/") return normalizeSlashes(`/${child}`);
  return normalizeSlashes(`${parent}/${child}`);
}

function compileRoute<T extends RouteDefinition>(
  route: T,
  parents: T[],
  parentPath: string,
  matcherFactory: RouteMatcherFactory,
): ResolvedRoute<T>[] {
  const pathname = parents.length
    ? joinRoutePaths(parentPath, route.path)
    : normalizeSlashes(`${parentPath}${route.path}`);
  const chain = [...parents, route];
  const children = (route.children ?? []) as T[];
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
    ...children.flatMap((child) =>
      compileRoute(child, chain, pathname, matcherFactory),
    ),
    resolved,
  ];
}

function normalizeRoutePath(path: string): string {
  return path
    .replace(legacyQueryRegex, "")
    .replace(optionalTrailingSlashRegex, "{/}")
    .replace(unnamedWildcardRegex, "/*splat")
    .replace(optionalParamRegex, "{/:$1}");
}

function normalizeSlashes(path: string): string {
  const normalized = path.replace(/\/{2,}/g, "/");
  return normalized || "/";
}
