import { pathToRegexp, match } from "path-to-regexp";
import { render, html, hydro, $, $$, setReuseElements } from "hydro-js";
let router;
const storageKey = "router-scroll";
const outletSelector = "[data-outlet]";
const reactivityRegex = /\{\{([^]*?)\}\}/;
const fetchCache = new WeakMap();
const optionalParamRegex = /\/:([A-Za-z_$][\w$]*)\?/g;
const legacyQueryRegex = /\(\\\?\)\?\(\.\*\)$/;
const scheduleIdle = window.requestIdleCallback?.bind(window) ??
    ((callback) => window.setTimeout(callback));
let base = $("base")?.getAttribute("href") || "";
if (base.endsWith("/")) {
    base = [...base].slice(0, -1).join("");
}
addEventListener("popstate", async (e) => {
    router?.doRouting(location.pathname + location.search, e);
});
// Reload -> store scrollPosition
addEventListener("beforeunload", () => sessionStorage.setItem(`${storageKey}-${location.pathname + location.search}`, `${scrollX} ${scrollY}`));
export default class Router {
    options;
    routes;
    oldRoute;
    routingVersion = 0;
    constructor(routes, options = {}) {
        const newRoutes = routes.flatMap((route) => {
            const { children, ...routeConfig } = route;
            const parent = createRoute(routeConfig);
            if (!children)
                return [parent];
            const childRoutes = children.map((child) => ({
                ...createRoute({
                    ...child,
                    path: `${route.path}/${child.path}`,
                }),
                isChildOf: parent,
            }));
            return [...childRoutes, parent];
        });
        this.routes = newRoutes;
        this.options = options;
        router = this;
        // Prefetch resources
        this.routes.forEach((route) => {
            // @ts-expect-error
            if (route.templateUrl && !navigator.connection?.saveData) {
                scheduleIdle(() => {
                    getTemplate(route).catch(async (err) => {
                        await this.options.errorHandler?.(err);
                    });
                });
            }
        });
        this.doRouting();
    }
    getMatchingRoute(path) {
        path = getRouteMatchPath(path);
        return this.routes.find((route) => route.path.exec(path));
    }
    async doRouting(to = location.pathname + location.search, e) {
        const routingVersion = ++this.routingVersion;
        const isCurrent = () => routingVersion === this.routingVersion;
        dispatchEvent(new Event("beforeRouting"));
        const from = this.oldRoute ?? to;
        const route = this.getMatchingRoute(to);
        if (route) {
            const routeStorageKey = `${storageKey}-${to}`;
            // Store position
            if (this.oldRoute) {
                sessionStorage.setItem(`${storageKey}-${from}`, `${scrollX} ${scrollY}`);
            }
            try {
                const { params } = match(route.originalPath, {
                    decode: decodeURIComponent,
                })(getRouteMatchPath(to));
                const allParams = {
                    ...Router.getParams(),
                    ...Object.fromEntries(Object.entries(params)
                        .map((pair) => Number.isNaN(Number(pair[0])) && pair)
                        .filter(Boolean)),
                };
                const props = {
                    from: from.replace(base, ""),
                    to: to.replace(base, ""),
                    ...(Object.keys(allParams).length ? { params: allParams } : {}),
                    ...(history.state && Object.keys(history.state).length
                        ? { state: history.state }
                        : {}),
                };
                // Trigger leave
                if (this.oldRoute) {
                    const oldRoute = this.routes.find((route) => route.path.exec(getRouteMatchPath(this.oldRoute)));
                    if (oldRoute) {
                        await oldRoute["leave" /* cycles.leave */]?.(props);
                        if (!isCurrent())
                            return;
                    }
                }
                // Trigger beforeEnter
                await route["beforeEnter" /* cycles.beforeEnter */]?.(props);
                if (!isCurrent())
                    return;
                // Handle template / element
                if (!!route.isChildOf) {
                    setReuseElements(false);
                    const parent = route.isChildOf;
                    if (parent.templateUrl) {
                        await handleTemplate(parent, $(outletSelector), isCurrent);
                        if (!isCurrent())
                            return;
                    }
                    else if (parent.element) {
                        const copy = $(outletSelector).cloneNode();
                        copy.append(html `${parent.element}`);
                        render(copy, outletSelector, false);
                    }
                    setReuseElements(true);
                }
                const where = route.isChildOf
                    ? $(outletSelector).querySelector(outletSelector)
                    : $(outletSelector);
                if (route?.templateUrl) {
                    await handleTemplate(route, where, isCurrent);
                    if (!isCurrent())
                        return;
                }
                else if (route?.element) {
                    const copy = where.cloneNode();
                    copy.append(html `${route.element}`);
                    render(copy, where, false);
                }
                else {
                    // Clear outlet
                    $(outletSelector).textContent = null;
                }
                // Trigger afterEnter
                await route["afterEnter" /* cycles.afterEnter */]?.(props);
                if (!isCurrent())
                    return;
                this.oldRoute = to;
            }
            catch (err) {
                if (this.options.errorHandler) {
                    await this.options.errorHandler(err, e);
                }
                else {
                    console.error(err, e);
                }
            }
            finally {
                if (!isCurrent()) {
                    dispatchEvent(new Event("afterRouting"));
                    return;
                }
                // Reload -> restore scroll position
                if (route.restoreScroll && sessionStorage.getItem(routeStorageKey)) {
                    const [left, top] = sessionStorage
                        .getItem(routeStorageKey)
                        .split(" ")
                        .map(Number);
                    sessionStorage.removeItem(routeStorageKey);
                    scrollTo({
                        top,
                        left,
                        behavior: this.options.scrollBehavior || "auto",
                    });
                }
                else {
                    // Reset Scroll, just like Browser
                    if (!window.isHMR) {
                        scrollTo({
                            top: 0,
                            left: 0,
                            behavior: this.options.scrollBehavior || "auto",
                        });
                    }
                }
                dispatchEvent(new Event("afterRouting"));
            }
        }
    }
    go(path, state = {}, params = "") {
        this.oldRoute = location.pathname + location.search;
        const newPath = base + path + params;
        // Only navigate when the path differs
        if (newPath !== this.oldRoute) {
            history.pushState({ ...state }, "", newPath);
            this.doRouting(newPath);
        }
    }
    removeRoute(path) {
        const idx = this.routes.findIndex((route) => String(route.path) ===
            String(pathToRegexp(normalizeRoutePath(base + path)).regexp));
        if (idx > -1) {
            this.routes.splice(idx, 1);
        }
    }
    addRoute(route) {
        this.routes.push(createRoute(route));
    }
    modifyRoute(path, newRoute) {
        const idx = this.routes.findIndex((route) => String(route.path) ===
            String(pathToRegexp(normalizeRoutePath(base + path)).regexp));
        if (idx > -1) {
            this.routes[idx] = createRoute(newRoute);
        }
    }
    changeOptions(options) {
        this.options = options;
    }
    static getParams(search = location.search) {
        return Object.fromEntries(new URLSearchParams(search));
    }
}
function registerAnchorEvent(anchor) {
    anchor.addEventListener("click", (e) => {
        const href = anchor.getAttribute("href");
        const target = anchor.getAttribute("target");
        if (e.defaultPrevented ||
            e.button !== 0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey ||
            !href ||
            anchor.hasAttribute("download") ||
            (target && target !== "_self")) {
            return;
        }
        const url = new URL(href, location.href);
        if (url.origin !== location.origin ||
            !["http:", "https:"].includes(url.protocol) ||
            (url.hash &&
                url.pathname === location.pathname &&
                url.search === location.search)) {
            return;
        }
        e.preventDefault();
        const hasData = anchor.getAttribute("data");
        const hydroProp = replaceBars(hasData);
        const path = url.pathname.startsWith(`${base}/`)
            ? url.pathname.slice(base.length)
            : url.pathname;
        router.go(path + url.search + url.hash, hasData ? hydro[hydroProp] : void 0);
    });
}
function registerFormEvent(form) {
    form.addEventListener("submit", (e) => {
        if (!router.options.formHandler)
            return;
        e.preventDefault();
        const action = form.action;
        const method = form.method.toUpperCase();
        fetch(action, {
            method,
            ...(!["HEAD", "GET"].includes(method)
                ? { body: new FormData(form) }
                : {}),
            ...router.options.fetchOptions,
        })
            .then((res) => router.options.formHandler(res, e))
            .catch(async (err) => {
            if (router.options.errorHandler) {
                await router.options.errorHandler(err, e);
            }
            else {
                console.error(err, e);
            }
        });
    });
}
function replaceBars(hydroTerm) {
    if (hydroTerm === null || !hydroTerm.includes("{{"))
        return hydroTerm;
    const [_, hydroPath] = hydroTerm.match(reactivityRegex) || [];
    return hydroPath;
}
function normalizeRoutePath(path) {
    return path
        .replace(legacyQueryRegex, "")
        .replace(optionalParamRegex, "{/:$1}");
}
function createRoute(route) {
    const routePath = normalizeRoutePath(base + route.path);
    return {
        restoreScroll: true,
        ...route,
        path: pathToRegexp(routePath).regexp,
        originalPath: routePath,
    };
}
function getRouteMatchPath(path) {
    if (path.startsWith(".")) {
        path = path.replace(".", "");
    }
    return path.split(/[?#]/, 1)[0] || "/";
}
// Add EventListener for every added anchor and form Element
$$("a").forEach(registerAnchorEvent);
$$("form").forEach(registerFormEvent);
new MutationObserver((entries) => {
    for (const entry of entries) {
        for (const node of entry.addedNodes) {
            const nodes = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT, {
                acceptNode(elem) {
                    return ["form", "a"].includes(elem.localName)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                },
            });
            let formOrA;
            while ((formOrA = nodes.nextNode())) {
                if (formOrA.localName === "a") {
                    registerAnchorEvent(formOrA);
                }
                else {
                    registerFormEvent(formOrA);
                }
            }
        }
    }
}).observe(document.body, { childList: true, subtree: true });
async function handleTemplate(route, where, isCurrent = () => true) {
    const copy = where.cloneNode();
    const template = window.isHMR
        ? await (await fetch(route.templateUrl)).text()
        : await getTemplate(route);
    if (!isCurrent())
        return;
    copy.append(html `${template}`);
    render(copy, where, false);
}
function getTemplate(route) {
    let cache = fetchCache.get(route);
    if (cache?.html !== undefined)
        return Promise.resolve(cache.html);
    if (!cache) {
        cache = {};
        fetchCache.set(route, cache);
    }
    if (!cache.promise) {
        cache.promise = fetch(route.templateUrl)
            .then((response) => response.text())
            .then((template) => {
            cache.html = template;
            return template;
        })
            .finally(() => {
            Reflect.deleteProperty(cache, "promise");
        });
    }
    return cache.promise;
}
