import { match } from "path-to-regexp";
import { render, html, hydro, $, $$ } from "hydro-js";
import { compileRoutes, getRoutePathname, resolveRoute, } from "./routes.js";
export { compileRoutes, resolveRoute } from "./routes.js";
let router;
const storageKey = "router-scroll";
const outletSelector = "[data-outlet]";
const reactivityRegex = /\{\{([^]*?)\}\}/;
const fetchCache = new WeakMap();
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
        const newRoutes = compileRoutes(routes, base).map(toRoute);
        this.routes = newRoutes;
        this.options = options;
        router = this;
        const initialUrl = location.pathname + location.search;
        const initialRoute = this.getMatchingRoute(initialUrl);
        const initialOutlet = $(outletSelector);
        const serverRoute = initialOutlet?.getAttribute("data-router-path");
        const adoptsInitialRoute = initialRoute !== undefined &&
            (serverRoute === initialUrl || serverRoute === location.pathname);
        if (adoptsInitialRoute) {
            initialOutlet.removeAttribute("data-router-path");
        }
        // Prefetch resources
        this.routes.forEach((route) => {
            if (adoptsInitialRoute && initialRoute.chain.includes(route.route)) {
                return;
            }
            // @ts-expect-error
            if (route.templateUrl && !navigator.connection?.saveData) {
                scheduleIdle(() => {
                    getTemplate(route.route).catch(async (err) => {
                        await this.options.errorHandler?.(err);
                    });
                });
            }
        });
        this.doRouting(initialUrl, undefined, adoptsInitialRoute);
        if (adoptsInitialRoute ||
            initialRoute?.chain.every((segment) => !segment.templateUrl)) {
            this.oldRoute = initialUrl;
        }
    }
    getMatchingRoute(path) {
        return resolveRoute(this.routes, path);
    }
    finishRouting(routingVersion) {
        if (routingVersion === this.routingVersion) {
            dispatchEvent(new Event("afterRouting"));
        }
    }
    async doRouting(to = location.pathname + location.search, e, adopt = false) {
        const routingVersion = ++this.routingVersion;
        const isCurrent = () => routingVersion === this.routingVersion;
        dispatchEvent(new Event("beforeRouting"));
        const from = this.oldRoute ?? to;
        const route = this.getMatchingRoute(to);
        if (!route) {
            this.finishRouting(routingVersion);
            return;
        }
        {
            const routeStorageKey = `${storageKey}-${to}`;
            // Store position
            if (this.oldRoute) {
                sessionStorage.setItem(`${storageKey}-${from}`, `${scrollX} ${scrollY}`);
            }
            try {
                const { params } = match(route.pathname, {
                    decode: decodeURIComponent,
                })(getRoutePathname(to));
                const allParams = {
                    ...Router.getParams(new URL(to, location.href).search),
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
                const currentRoute = this.oldRoute
                    ? this.getMatchingRoute(this.oldRoute)
                    : undefined;
                if (currentRoute) {
                    await currentRoute["leave" /* cycles.leave */]?.(props);
                    if (!isCurrent())
                        return;
                }
                // Trigger beforeEnter
                await route["beforeEnter" /* cycles.beforeEnter */]?.(props);
                if (!isCurrent())
                    return;
                if (!adopt) {
                    await renderRoute(route, currentRoute, $(outletSelector), isCurrent, this.options.viewTransitions);
                    if (!isCurrent())
                        return;
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
                if (!isCurrent())
                    return;
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
                this.finishRouting(routingVersion);
            }
        }
    }
    go(path, state = {}, params = "") {
        const newPath = base + path + params;
        // Only navigate when the path differs
        if (newPath !== location.pathname + location.search) {
            history.pushState({ ...state }, "", newPath);
            this.doRouting(newPath);
        }
    }
    removeRoute(path) {
        const target = this.routes.find((route) => route.pathname === getCompiledPathname(path));
        if (!target)
            return;
        for (let index = this.routes.length - 1; index >= 0; index--) {
            if (this.routes[index].chain.includes(target.route)) {
                this.routes.splice(index, 1);
            }
        }
    }
    addRoute(route) {
        this.routes.push(...compileRoutes([route], base).map(toRoute));
    }
    modifyRoute(path, newRoute) {
        const target = this.routes.find((route) => route.pathname === getCompiledPathname(path));
        if (!target)
            return;
        const descendantIndexes = this.routes.flatMap((route, index) => route.chain.includes(target.route) ? [index] : []);
        this.routes.splice(descendantIndexes[0], descendantIndexes.length, ...compileRoutes([newRoute], base).map(toRoute));
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
function toRoute(resolved) {
    return {
        restoreScroll: true,
        ...resolved.route,
        ...resolved,
        originalPath: resolved.pathname,
    };
}
function getCompiledPathname(path) {
    return compileRoutes([{ path }], base)[0].pathname;
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
async function renderRoute(route, currentRoute, where, isCurrent, viewTransitions = false) {
    let sharedSegments = 0;
    while (currentRoute?.chain[sharedSegments] === route.chain[sharedSegments] &&
        sharedSegments < route.chain.length) {
        sharedSegments++;
    }
    if (sharedSegments === route.chain.length)
        sharedSegments--;
    for (let index = 0; index < sharedSegments; index++) {
        const nestedOutlet = where.querySelector(outletSelector);
        if (!nestedOutlet)
            break;
        where = nestedOutlet;
    }
    const routeChain = route.chain.slice(sharedSegments);
    const templates = await Promise.all(routeChain.map(async (segment) => segment.templateUrl
        ? window.isHMR
            ? (await fetch(segment.templateUrl)).text()
            : getTemplate(segment)
        : segment.element));
    if (!isCurrent())
        return;
    const copy = where.cloneNode();
    let outlet = copy;
    for (let index = 0; index < routeChain.length; index++) {
        const content = templates[index];
        if (content !== undefined)
            outlet.append(html `${content}`);
        if (index === routeChain.length - 1)
            continue;
        const nestedOutlet = outlet.querySelector(outletSelector);
        if (!nestedOutlet) {
            throw new Error(`Route ${route.pathname} needs a nested ${outletSelector}`);
        }
        nestedOutlet.replaceChildren();
        outlet = nestedOutlet;
    }
    if (!viewTransitions || !document.startViewTransition) {
        render(copy, where, false);
        return;
    }
    const transition = document.startViewTransition(() => {
        if (isCurrent())
            render(copy, where, false);
    });
    void transition.ready.catch(() => { });
    await transition.updateCallbackDone;
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
