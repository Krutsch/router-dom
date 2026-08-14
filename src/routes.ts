const legacyQueryRegex = /\(\\\?\)\?\(\.\*\)$/;

export interface RoutePattern {
  exec(input: { pathname: string }): RoutePatternResult | null;
}

export interface RoutePatternResult {
  pathname: {
    groups: Record<string, string | undefined>;
  };
}

export interface RoutePatternConstructor {
  new (input: { pathname: string }): RoutePattern;
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

export function compileRoutes<T extends RouteDefinition>(
  routes: readonly T[],
  base = "",
  matcherFactory: RouteMatcherFactory = createURLPatternMatcher,
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
  return routes.find((route) => route.path.exec({ pathname }));
}

export function matchResolvedRoute<T extends RouteDefinition>(
  route: ResolvedRoute<T>,
  pathname: string,
) {
  return route.path.exec({ pathname }) ?? undefined;
}

export function createURLPatternMatcher(pathname: string): RoutePattern {
  const URLPatternConstructor = (
    globalThis as typeof globalThis & {
      URLPattern?: RoutePatternConstructor;
    }
  ).URLPattern;
  if (!URLPatternConstructor) {
    throw new Error("router-dom requires URLPattern");
  }
  return new URLPatternConstructor({ pathname });
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
  const resolved = {
    route,
    chain,
    path: matcherFactory(normalizedPathname),
    pathname: normalizedPathname,
  };

  return [
    ...children.flatMap((child) =>
      compileRoute(child, chain, pathname, matcherFactory),
    ),
    resolved,
  ];
}

function normalizeRoutePath(path: string): string {
  return path.replace(legacyQueryRegex, "");
}

function normalizeSlashes(path: string): string {
  const normalized = path.replace(/\/{2,}/g, "/");
  return normalized || "/";
}
