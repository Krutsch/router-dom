import { html, render } from "hydro-js";
const outletSelector = "[data-outlet]";
export function createTemplateLoader(fetcher, isHMR) {
    const cache = new Map();
    const loadCached = (route) => {
        const templateUrl = route.templateUrl;
        let entry = cache.get(templateUrl);
        if (entry?.html !== undefined)
            return Promise.resolve(entry.html);
        if (!entry) {
            entry = {};
            cache.set(templateUrl, entry);
        }
        if (!entry.promise) {
            entry.promise = fetcher(route.templateUrl)
                .then((response) => response.text())
                .then((template) => {
                entry.html = template;
                return template;
            })
                .finally(() => {
                Reflect.deleteProperty(entry, "promise");
            });
        }
        return entry.promise;
    };
    return {
        load(route) {
            if (isHMR()) {
                return fetcher(route.templateUrl).then((response) => response.text());
            }
            return loadCached(route);
        },
    };
}
export class RouteRenderer {
    templates;
    dom;
    constructor(templates, dom) {
        this.templates = templates;
        this.dom = dom;
    }
    async render(route, currentRoute, where, isCurrent, viewTransitions = false) {
        let sharedSegments = 0;
        while (currentRoute?.chain[sharedSegments] === route.chain[sharedSegments] &&
            sharedSegments < route.chain.length) {
            sharedSegments++;
        }
        if (sharedSegments === route.chain.length)
            sharedSegments--;
        for (let index = 0; index < sharedSegments; index++) {
            const nestedOutlet = this.dom.findOutlet(where);
            if (!nestedOutlet)
                break;
            where = nestedOutlet;
        }
        const routeChain = route.chain.slice(sharedSegments);
        const templates = await Promise.all(routeChain.map(async (segment) => segment.templateUrl ? this.templates.load(segment) : segment.element));
        if (!isCurrent())
            return;
        const copy = this.dom.clone(where);
        let outlet = copy;
        for (let index = 0; index < routeChain.length; index++) {
            const content = templates[index];
            if (content !== undefined)
                this.dom.append(outlet, content);
            if (index === routeChain.length - 1)
                continue;
            const nestedOutlet = this.dom.findOutlet(outlet);
            if (!nestedOutlet) {
                throw new Error(`Route ${route.pathname} needs a nested ${outletSelector}`);
            }
            this.dom.clear(nestedOutlet);
            outlet = nestedOutlet;
        }
        if (!viewTransitions || !this.dom.supportsViewTransitions()) {
            this.dom.commit(copy, where);
            return;
        }
        await this.dom.commitWithViewTransition(() => {
            if (isCurrent())
                this.dom.commit(copy, where);
        });
    }
    prefetch(route) {
        return route.templateUrl ? this.templates.load(route) : Promise.resolve("");
    }
}
export function createHydroRenderAdapter(document) {
    const viewTransitionDocument = document;
    return {
        findOutlet(where) {
            return where.querySelector(outletSelector);
        },
        clone(where) {
            return where.cloneNode();
        },
        append(outlet, content) {
            outlet.append(html `${content}`);
        },
        clear(outlet) {
            outlet.replaceChildren();
        },
        commit(copy, where) {
            render(copy, where, false);
        },
        supportsViewTransitions() {
            return typeof viewTransitionDocument.startViewTransition === "function";
        },
        async commitWithViewTransition(update) {
            const transition = viewTransitionDocument.startViewTransition(update);
            void transition.ready.catch(() => { });
            await transition.updateCallbackDone;
        },
    };
}
