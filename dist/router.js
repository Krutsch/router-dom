import { listen } from "quicklink";
import { pathToRegexp } from "path-to-regexp";
import { render, html, hydro, $, $$ } from "hydro-js";
listen();
let router;
const outletSelector = "[data-outlet]";
const reactivityRegex = /\{\{([^]*?)\}\}/;
const flagsRegex = /:\w+/g;
let base = $("base")?.getAttribute("href") || "";
if (base.endsWith("/")) {
    base = [...base].slice(0, -1).join("");
}
addEventListener("popstate", async (e) => {
    const to = location.pathname;
    const from = router.oldRoute ?? to;
    const route = getMatchingRoute(to);
    if (route) {
        try {
            const [_, ...values] = to.match(route.path);
            const params = Array.from(route.originalPath.matchAll(flagsRegex))
                .flat()
                .map((i) => i.replace(":", ""))
                .reduce((state, key, idx) => {
                state[key] = values[idx];
                return state;
            }, {});
            const allParams = { ...router.getParams(), ...params };
            const props = {
                from: from.replace(base, ""),
                to: to.replace(base, ""),
                ...(Object.keys(allParams).length ? { params: allParams } : {}),
                ...history.state,
            };
            // Trigger leave
            if (router.oldRoute) {
                const oldRoute = router.routes.find((route) => route.path.exec(router.oldRoute));
                if (oldRoute) {
                    await oldRoute["leave" /* leave */]?.(props);
                    router.oldRoute = route.originalPath;
                }
            }
            // Trigger beforeEnter
            await route["beforeEnter" /* beforeEnter */]?.(props);
            // Handle template / element
            if (route?.templateUrl) {
                const data = await fetch(route.templateUrl);
                const _html = await data.text();
                render(html `<div data-outlet>${_html}</div>`, outletSelector, false);
            }
            else if (route?.element) {
                render(html `<div data-outlet>${route?.element}</div>`, outletSelector, false);
            }
            else {
                // Clear outlet
                $(outletSelector).textContent = null;
            }
            // Trigger afterEnter
            await route["afterEnter" /* afterEnter */]?.(props);
        }
        catch (err) {
            if (router.options.errorHandler) {
                await router.options.errorHandler(err, e);
            }
            else {
                console.error(err, e);
            }
        }
    }
});
export default class Router {
    constructor(routes, options = {}) {
        const newRoutes = routes.map((route) => {
            return {
                ...route,
                path: pathToRegexp(base + route.path),
                originalPath: base + route.path,
            };
        });
        this.routes = newRoutes;
        this.options = options;
        router = this;
        this.triggerEvent();
    }
    triggerEvent() {
        dispatchEvent(new Event("popstate"));
    }
    go(path, state, params = "") {
        this.oldRoute = location.pathname;
        // Only navigate when the path differs
        if (path !== this.oldRoute) {
            history.pushState({ ...state }, "", base + path + params);
            this.triggerEvent();
        }
    }
    removeRoute(path) {
        const idx = this.routes.findIndex((route) => String(route.path) === String(pathToRegexp(path)));
        if (idx > -1) {
            this.routes.splice(idx, 1);
        }
    }
    addRoute(route) {
        this.routes.push({
            ...route,
            path: pathToRegexp(base + route.path),
            originalPath: base + route.path,
        });
    }
    modifyRoute(path, newRoute) {
        const idx = this.routes.findIndex((route) => String(route.path) === String(pathToRegexp(path)));
        if (idx > -1) {
            this.routes[idx] = {
                ...newRoute,
                path: pathToRegexp(base + newRoute.path),
                originalPath: base + path,
            };
        }
    }
    changeOptions(options) {
        this.options = options;
    }
    getParams(search = location.search) {
        return Object.fromEntries(new URLSearchParams(search));
    }
}
function getMatchingRoute(path) {
    if (path.startsWith(".")) {
        path = path.replace(".", "");
    }
    return router.routes.find((route) => route.path.exec(path));
}
function registerAnchorEvent(anchor) {
    if (anchor.getAttribute("href")?.startsWith("http"))
        return;
    anchor.addEventListener("click", (e) => {
        e.preventDefault();
        const hasData = anchor.getAttribute("data");
        const hydroProp = replaceBars(hasData);
        let href = anchor.getAttribute("data-href") || anchor.getAttribute("href") || "";
        router.go(href, hasData ? hydro[hydroProp] : void 0);
    });
}
function registerFormEvent(form) {
    form.addEventListener("submit", (e) => {
        if (!router.options.formHandler)
            return;
        e.preventDefault();
        const action = form.getAttribute("action");
        const method = form.getAttribute("method");
        fetch(action, {
            method,
            ...(!["HEAD", "GET"].includes(method.toUpperCase())
                ? { body: new FormData(form) }
                : {}),
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
