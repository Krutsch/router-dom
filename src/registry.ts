import {
  compileRoutes,
  createPathToRegexpMatcher,
  resolveRoute,
  type ResolvedRoute,
  type RouteDefinition,
  type RouteMatcherFactory,
} from "./routes.js";

export class RouteRegistry<T extends RouteDefinition> {
  private entries: ResolvedRoute<T>[];

  constructor(
    routes: readonly T[],
    private readonly base = "",
    private readonly matcherFactory: RouteMatcherFactory = createPathToRegexpMatcher,
  ) {
    this.entries = compileRoutes(routes, base, matcherFactory);
  }

  get routes(): readonly ResolvedRoute<T>[] {
    return this.entries;
  }

  get snapshot(): readonly ResolvedRoute<T>[] {
    const clones = new WeakMap<object, RouteDefinition>();
    return Object.freeze(
      this.entries.map((entry) => {
        const chain = entry.chain.map((route) =>
          cloneRouteDefinition(route, clones),
        );
        return Object.freeze({
          ...entry,
          path: new RegExp(entry.path.source, entry.path.flags),
          route:
            chain[chain.length - 1] ||
            cloneRouteDefinition(entry.route, clones),
          chain: Object.freeze(chain) as unknown as T[],
        }) as ResolvedRoute<T>;
      }),
    ) as readonly ResolvedRoute<T>[];
  }

  resolve(url: string): ResolvedRoute<T> | undefined {
    return resolveRoute(this.entries, url);
  }

  addRoute(route: T) {
    this.entries.push(
      ...compileRoutes([route], this.base, this.matcherFactory),
    );
  }

  removeRoute(path: string) {
    const target = this.findByPath(path);
    if (!target) return;

    this.entries = this.entries.filter(
      (route) => !route.chain.includes(target.route),
    );
  }

  modifyRoute(path: string, newRoute: T) {
    const target = this.findByPath(path);
    if (!target) return;

    const indexes = this.entries.flatMap((route, index) =>
      route.chain.includes(target.route) ? [index] : [],
    );
    const firstIndex = indexes[0];
    const lastIndex = indexes[indexes.length - 1];
    const replacement = compileRoutes(
      [newRoute],
      this.base,
      this.matcherFactory,
    );

    this.entries = [
      ...this.entries.slice(0, firstIndex),
      ...replacement,
      ...this.entries.slice(lastIndex + 1),
    ];
  }

  private findByPath(path: string) {
    const compiledPath = compileRoutes(
      [{ path } as T],
      this.base,
      this.matcherFactory,
    )[0].pathname;
    return this.entries.find((route) => route.pathname === compiledPath);
  }
}

function cloneRouteDefinition<T extends RouteDefinition>(
  route: T,
  clones: WeakMap<object, RouteDefinition>,
): T {
  const existing = clones.get(route);
  if (existing) return existing as T;

  const clone = { ...route } as T;
  clones.set(route, clone);
  if (route.children) {
    clone.children = Object.freeze(
      route.children.map((child) => cloneRouteDefinition(child, clones)),
    ) as T["children"];
  }
  return Object.freeze(clone) as T;
}
