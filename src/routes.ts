const legacyQueryRegex = /\(\\\?\)\?\(\.\*\)$/;

export interface RoutePattern {
  exec(input: { pathname: string }): RoutePatternResult | null;
}

export interface RoutePatternResult {
  pathname: {
    groups: Record<string, string | undefined>;
  };
}

interface URLPatternConstructor {
  new (input: { pathname: string }): RoutePattern;
}

export interface RouteDefinition {
  path: string;
  children?: RouteDefinition[];
}

export interface ResolvedRoute<T extends RouteDefinition = RouteDefinition> {
  route: T;
  chain: T[];
  path: RoutePattern;
  pathname: string;
}

export function compileRoutes<T extends RouteDefinition>(
  routes: readonly T[],
  base = "",
): ResolvedRoute<T>[] {
  return routes.flatMap((route) => compileRoute(route, [], base));
}

export function resolveRoute<T extends RouteDefinition>(
  routes: readonly ResolvedRoute<T>[],
  url: string,
): ResolvedRoute<T> | undefined {
  const pathname = getRoutePathname(url);
  return routes.find((route) => route.path.exec({ pathname }));
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
): ResolvedRoute<T>[] {
  const pathname = parents.length
    ? joinRoutePaths(parentPath, route.path)
    : normalizeSlashes(`${parentPath}${route.path}`);
  const chain = [...parents, route];
  const children = (route.children ?? []) as T[];
  return [
    ...children.flatMap((child) => compileRoute(child, chain, pathname)),
    {
      route,
      chain,
      path: createRoutePattern(normalizeRoutePath(pathname)),
      pathname: normalizeRoutePath(pathname),
    },
  ];
}

function normalizeRoutePath(path: string): string {
  return path.replace(legacyQueryRegex, "");
}

function createRoutePattern(pathname: string): RoutePattern {
  const URLPatternConstructor = (
    globalThis as typeof globalThis & {
      URLPattern?: URLPatternConstructor;
    }
  ).URLPattern;
  if (!URLPatternConstructor) {
    throw new Error("router-dom requires URLPattern");
  }
  return new URLPatternConstructor({ pathname });
}

function normalizeSlashes(path: string): string {
  const normalized = path.replace(/\/{2,}/g, "/");
  return normalized || "/";
}
