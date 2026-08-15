const storageKey = "router-scroll";
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
            const navigation = window.navigation;
            const navigationState = navigation?.currentEntry?.getState();
            if (navigationState !== undefined)
                return navigationState;
            const state = history.state;
            return state && Object.keys(state).length ? state : undefined;
        },
        setNativeScrollRestoration() {
            history.scrollRestoration = "auto";
        },
        finishScroll(restoreScroll, isTraversal, behavior = "auto") {
            scroll.cancel();
            const stored = scroll.takeCommittedPosition();
            if (!restoreScroll)
                scroll.forget();
            // Only history traversal restores a position; a fresh entry starts on top.
            if (isTraversal && restoreScroll && stored && (stored[0] || stored[1])) {
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
    };
}
let scrollManager;
// One owner per document, so re-created routers keep the same history bookkeeping.
function getScrollManager() {
    return (scrollManager ??= createScrollManager());
}
// Stable per history slot and kept across reloads, unlike the entry id.
function currentEntryKey() {
    return window.navigation?.currentEntry?.key ?? "";
}
function createScrollManager() {
    const navigation = window.navigation;
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
    // Snapshot before any load-time scroll event can overwrite the reload target.
    let initialPosition = positions.get(currentEntryKey());
    let committedPosition;
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
        const key = currentEntryKey();
        positions.delete(key);
        positions.set(key, [scrollX, scrollY]);
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
    // Fires before the entry commits, so this still belongs to the leaving entry.
    navigation?.addEventListener("navigate", () => {
        if (!restoring)
            record();
        cancel();
        flush();
    });
    // Read at commit time: rendering may clamp the scroll and overwrite the target.
    navigation?.addEventListener("currententrychange", () => {
        committedPosition = positions.get(currentEntryKey());
    });
    window.addEventListener("pagehide", () => {
        if (!restoring)
            record();
        cancel();
        flush();
    });
    window.addEventListener("pageshow", (event) => {
        // The BFCache already restored DOM and scroll: never fight it.
        if (event.persisted)
            cancel();
    });
    return {
        flush,
        cancel,
        restore,
        takeCommittedPosition: () => {
            const position = committedPosition;
            committedPosition = undefined;
            return position;
        },
        // Consumed once: a router re-created later must not re-apply the load position.
        takeInitialPosition: () => {
            const position = initialPosition;
            initialPosition = undefined;
            return position;
        },
        forget: () => {
            positions.delete(currentEntryKey());
            schedulePersist();
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
        const document = platform.document;
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
                            return element.localName === "form"
                                ? NodeFilter.FILTER_ACCEPT
                                : NodeFilter.FILTER_REJECT;
                        },
                    });
                    let formOrAnchor;
                    while ((formOrAnchor = nodes.nextNode())) {
                        this.registerFormEvent(formOrAnchor);
                    }
                }
            }
        }).observe(body, { childList: true, subtree: true });
    }
    attach(router) {
        this.router = router;
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
