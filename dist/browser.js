import { hydro } from "hydro-js";
const storageKey = "router-scroll";
const scrollStateKey = "__routerScroll";
const maxStoredEntries = 50;
const maxScrollRestoreDuration = 3_000;
const scrollRestoreInterval = 32;
const interruptEvents = [
    "wheel",
    "touchstart",
    "keydown",
    "pointerdown",
];
const interruptOptions = { capture: true, passive: true };
const reactivityRegex = /\{\{([^]*?)\}\}/;
export function createBrowserPlatform() {
    const document = window.document;
    let base = document.querySelector("base")?.getAttribute("href") || "";
    if (base.endsWith("/"))
        base = [...base].slice(0, -1).join("");
    const browserWindow = window;
    const scroll = getScrollManager();
    return {
        document,
        base,
        currentUrl() {
            return location.pathname + location.search;
        },
        currentHref() {
            return location.href;
        },
        currentState() {
            const state = history.state;
            if (!state)
                return undefined;
            const { [scrollStateKey]: _scrollKey, ...rest } = state;
            return Object.keys(rest).length ? rest : undefined;
        },
        push(path, state) {
            scroll.save();
            scroll.cancel();
            scroll.flush();
            const entryKey = createScrollKey();
            history.pushState({ ...state, [scrollStateKey]: entryKey }, "", path);
            scroll.adoptKey(entryKey);
        },
        setNativeScrollRestoration() {
            history.scrollRestoration = "auto";
        },
        setManualScrollRestoration() {
            history.scrollRestoration = "manual";
        },
        finishScroll(restoreScroll, isTraversal, behavior = "auto") {
            scroll.cancel();
            const stored = restoreScroll ? scroll.position() : undefined;
            if (!restoreScroll)
                scroll.forget();
            // Only history traversal restores a position; a fresh entry starts on top.
            if (isTraversal && stored && (stored[0] || stored[1])) {
                scroll.restore(stored);
                return;
            }
            scrollTo({ top: 0, left: 0, behavior: isTraversal ? "auto" : behavior });
        },
        restoreInitialScroll() {
            scroll.cancel();
            const stored = scroll.takeInitialPosition();
            // Native restoration already ran; this only corrects late-rendered content.
            if (stored && (stored[0] || stored[1]))
                scroll.restore(stored);
        },
        isHMR() {
            return Boolean(browserWindow.isHMR);
        },
        shouldPrefetch() {
            const navigatorWithConnection = navigator;
            return !navigatorWithConnection.connection?.saveData;
        },
        scheduleIdle(callback) {
            if (browserWindow.requestIdleCallback) {
                browserWindow.requestIdleCallback(callback);
            }
            else {
                window.setTimeout(callback);
            }
        },
        fetch(input, init) {
            return browserWindow.fetch(input, init);
        },
        outlet() {
            return document.querySelector("[data-outlet]");
        },
        removeServerRouteMarker(outlet) {
            outlet.removeAttribute("data-router-path");
        },
        dispatch(name) {
            window.dispatchEvent(new Event(name));
        },
        onPopState(listener) {
            window.addEventListener("popstate", (event) => {
                scroll.syncFromHistory();
                listener(event);
            });
        },
    };
}
function createScrollKey() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
let scrollManager;
// One owner per document, so re-created routers keep the same history bookkeeping.
function getScrollManager() {
    return (scrollManager ??= createScrollManager());
}
function readEntryKey() {
    const state = history.state;
    const key = state?.[scrollStateKey];
    if (typeof key === "string")
        return key;
    const created = createScrollKey();
    try {
        history.replaceState({ ...state, [scrollStateKey]: created }, "");
    }
    catch {
        // A rejected replaceState only costs restoration across reloads.
    }
    return created;
}
function createScrollManager() {
    const positions = new Map();
    try {
        const raw = sessionStorage.getItem(storageKey);
        for (const [key, position] of Object.entries((raw ? JSON.parse(raw) : {}))) {
            if (Array.isArray(position)) {
                positions.set(key, [
                    Number(position[0]) || 0,
                    Number(position[1]) || 0,
                ]);
            }
        }
    }
    catch {
        // Storage may be unavailable, disabled or corrupted.
    }
    let currentKey = readEntryKey();
    // Snapshot before any load-time scroll event can overwrite the reload target.
    let initialPosition = positions.get(currentKey);
    let persistTimer;
    let restoreVersion = 0;
    let restoring = false;
    let stopRestore = (_recordFinal) => { };
    const flush = () => {
        if (persistTimer !== undefined) {
            window.clearTimeout(persistTimer);
            persistTimer = undefined;
        }
        try {
            for (const key of positions.keys()) {
                if (positions.size <= maxStoredEntries)
                    break;
                positions.delete(key);
            }
            sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(positions)));
        }
        catch {
            // Scroll persistence must never block navigation.
        }
    };
    const schedulePersist = () => {
        if (persistTimer !== undefined)
            return;
        persistTimer = window.setTimeout(() => {
            persistTimer = undefined;
            flush();
        }, 200);
    };
    const record = () => {
        positions.delete(currentKey);
        positions.set(currentKey, [scrollX, scrollY]);
        schedulePersist();
    };
    const cancel = () => {
        restoreVersion += 1;
        stopRestore(false);
    };
    const restore = ([left, top]) => {
        cancel();
        const version = restoreVersion;
        const deadline = performance.now() + maxScrollRestoreDuration;
        let timer;
        const stop = (recordFinal) => {
            if (timer !== undefined)
                window.clearTimeout(timer);
            timer = undefined;
            for (const name of interruptEvents) {
                window.removeEventListener(name, interrupt, interruptOptions);
            }
            if (stopRestore !== stop)
                return;
            stopRestore = () => { };
            restoring = false;
            if (recordFinal)
                record();
        };
        const interrupt = () => stop(true);
        const step = () => {
            timer = undefined;
            if (version !== restoreVersion)
                return;
            scrollTo({ top, left, behavior: "auto" });
            const reached = Math.abs(scrollY - top) <= 1 && Math.abs(scrollX - left) <= 1;
            if (reached || performance.now() >= deadline) {
                stop(true);
                return;
            }
            // Content may still be growing, so keep correcting until it fits.
            timer = window.setTimeout(step, scrollRestoreInterval);
        };
        restoring = true;
        stopRestore = stop;
        for (const name of interruptEvents) {
            window.addEventListener(name, interrupt, interruptOptions);
        }
        step();
    };
    window.addEventListener("scroll", () => {
        if (!restoring)
            record();
    }, { passive: true });
    window.addEventListener("pagehide", (event) => {
        if (!restoring)
            record();
        cancel();
        flush();
        // Hand scroll ownership back so a reload is restored natively, before paint.
        if (!event.persisted)
            history.scrollRestoration = "auto";
    });
    window.addEventListener("pageshow", (event) => {
        if (!event.persisted)
            return;
        // The BFCache already restored DOM and scroll: only re-sync the entry.
        cancel();
        currentKey = readEntryKey();
        history.scrollRestoration = "manual";
    });
    return {
        // Skipped while restoring: the in-flight target is the value worth keeping.
        save: () => {
            if (!restoring)
                record();
        },
        flush,
        cancel,
        restore,
        position: () => positions.get(currentKey),
        // Consumed once: a router re-created later must not re-apply the load position.
        takeInitialPosition: () => {
            const position = initialPosition;
            initialPosition = undefined;
            return position;
        },
        forget: () => {
            positions.delete(currentKey);
            schedulePersist();
        },
        adoptKey: (key) => {
            currentKey = key;
        },
        syncFromHistory: () => {
            if (!restoring)
                record();
            cancel();
            flush();
            currentKey = readEntryKey();
        },
    };
}
const browserShells = new WeakMap();
export function attachBrowserShell(router, platform) {
    let shell = browserShells.get(platform.document);
    if (!shell) {
        shell = new BrowserShell(platform);
        browserShells.set(platform.document, shell);
    }
    shell.attach(router);
}
class BrowserShell {
    platform;
    router;
    registeredElements = new WeakSet();
    constructor(platform) {
        this.platform = platform;
        platform.onPopState((event) => {
            void this.router?.doRouting(platform.currentUrl(), event);
        });
        const document = platform.document;
        document
            .querySelectorAll("a")
            .forEach((anchor) => this.registerAnchorEvent(anchor));
        document
            .querySelectorAll("form")
            .forEach((form) => this.registerFormEvent(form));
        const body = document.body;
        if (!body)
            return;
        new MutationObserver((entries) => {
            for (const entry of entries) {
                for (const node of entry.addedNodes) {
                    const nodes = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT, {
                        acceptNode(element) {
                            return ["form", "a"].includes(element.localName)
                                ? NodeFilter.FILTER_ACCEPT
                                : NodeFilter.FILTER_REJECT;
                        },
                    });
                    let formOrAnchor;
                    while ((formOrAnchor = nodes.nextNode())) {
                        if (formOrAnchor.localName === "a") {
                            this.registerAnchorEvent(formOrAnchor);
                        }
                        else {
                            this.registerFormEvent(formOrAnchor);
                        }
                    }
                }
            }
        }).observe(body, { childList: true, subtree: true });
    }
    attach(router) {
        this.router = router;
    }
    registerAnchorEvent(anchor) {
        if (this.registeredElements.has(anchor))
            return;
        this.registeredElements.add(anchor);
        anchor.addEventListener("click", (event) => {
            const href = anchor.getAttribute("href");
            const target = anchor.getAttribute("target");
            if (event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                !href ||
                anchor.hasAttribute("download") ||
                (target && target !== "_self")) {
                return;
            }
            const currentUrl = new URL(this.platform.currentHref());
            const url = new URL(href, currentUrl);
            if (url.origin !== currentUrl.origin ||
                !["http:", "https:"].includes(url.protocol) ||
                (url.hash &&
                    url.pathname === currentUrl.pathname &&
                    url.search === currentUrl.search)) {
                return;
            }
            event.preventDefault();
            const data = anchor.getAttribute("data");
            const hydroProp = replaceBars(data);
            const path = url.pathname.startsWith(`${this.platform.base}/`)
                ? url.pathname.slice(this.platform.base.length)
                : url.pathname;
            this.router?.go(path + url.search + url.hash, data ? hydro[hydroProp] : undefined);
        });
    }
    registerFormEvent(form) {
        if (this.registeredElements.has(form))
            return;
        this.registeredElements.add(form);
        form.addEventListener("submit", (event) => {
            const router = this.router;
            if (!router || !router.options.formHandler)
                return;
            event.preventDefault();
            const action = form.action;
            const method = form.method.toUpperCase();
            this.platform
                .fetch(action, {
                method,
                ...(!["HEAD", "GET"].includes(method)
                    ? { body: new FormData(form) }
                    : {}),
                ...router.options.fetchOptions,
            })
                .then((response) => router.options.formHandler(response, event))
                .catch(async (error) => {
                if (router.options.errorHandler) {
                    await router.options.errorHandler(error, event);
                }
                else {
                    console.error(error, event);
                }
            });
        });
    }
}
function replaceBars(hydroTerm) {
    if (hydroTerm === null || !hydroTerm.includes("{{"))
        return hydroTerm;
    const [_, hydroPath] = hydroTerm.match(reactivityRegex) || [];
    return hydroPath;
}
