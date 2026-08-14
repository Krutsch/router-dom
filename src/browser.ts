import type { LooseObject, RouterOptions } from "./types.js";

const storageKey = "router-scroll";

export interface BrowserPlatform {
  readonly document: Document;
  readonly base: string;
  currentUrl(): string;
  currentHref(): string;
  currentState(): LooseObject | undefined;
  setManualScrollRestoration(): void;
  saveScroll(url: string): void;
  finishScroll(
    url: string,
    restoreScroll: boolean,
    behavior?: ScrollBehavior,
  ): void;
  isHMR(): boolean;
  shouldPrefetch(): boolean;
  scheduleIdle(callback: () => void): void;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  outlet(): Element | null;
  removeServerRouteMarker(outlet: Element): void;
  dispatch(name: string): void;
  onBeforeUnload(listener: () => void): void;
}

export function createBrowserPlatform(): BrowserPlatform {
  const document = window.document;
  let base = document.querySelector("base")?.getAttribute("href") || "";
  if (base.endsWith("/")) base = [...base].slice(0, -1).join("");

  const browserWindow = window as Window & {
    isHMR?: boolean;
    requestIdleCallback?: (callback: () => void) => number;
  };

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
      if (navigationState !== undefined) return navigationState as LooseObject;
      const state = history.state;
      return state && Object.keys(state).length ? state : undefined;
    },
    setManualScrollRestoration() {
      history.scrollRestoration = "manual";
    },
    saveScroll(url) {
      sessionStorage.setItem(`${storageKey}-${url}`, `${scrollX} ${scrollY}`);
    },
    finishScroll(url, restoreScroll, behavior = "auto") {
      const routeStorageKey = `${storageKey}-${url}`;
      const stored = restoreScroll
        ? sessionStorage.getItem(routeStorageKey)
        : null;
      if (stored) {
        const [left, top] = stored.split(" ").map(Number);
        sessionStorage.removeItem(routeStorageKey);
        scrollTo({ top, left, behavior });
        return;
      }

      if (!browserWindow.isHMR) {
        scrollTo({ top: 0, left: 0, behavior });
      }
    },
    isHMR() {
      return Boolean(browserWindow.isHMR);
    },
    shouldPrefetch() {
      const navigatorWithConnection = navigator as Navigator & {
        connection?: { saveData?: boolean };
      };
      return !navigatorWithConnection.connection?.saveData;
    },
    scheduleIdle(callback) {
      if (browserWindow.requestIdleCallback) {
        browserWindow.requestIdleCallback(callback);
      } else {
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
    onBeforeUnload(listener) {
      window.addEventListener("beforeunload", listener);
    },
  };
}

export interface BrowserRouterLike {
  options: RouterOptions;
}

const browserShells = new WeakMap<Document, BrowserShell>();

export function attachBrowserShell(
  router: BrowserRouterLike,
  platform: BrowserPlatform,
) {
  let shell = browserShells.get(platform.document);
  if (!shell) {
    shell = new BrowserShell(platform);
    browserShells.set(platform.document, shell);
  }
  shell.attach(router);
}

class BrowserShell {
  private router: BrowserRouterLike | undefined;
  private readonly registeredElements = new WeakSet<Element>();

  constructor(private readonly platform: BrowserPlatform) {
    platform.onBeforeUnload(() => {
      platform.saveScroll(platform.currentUrl());
    });

    const document = platform.document;
    document
      .querySelectorAll("form")
      .forEach((form) => this.registerFormEvent(form));

    const body = document.body;
    if (!body) return;

    new MutationObserver((entries) => {
      for (const entry of entries) {
        for (const node of entry.addedNodes) {
            const nodes = document.createNodeIterator(
              node,
              NodeFilter.SHOW_ELEMENT,
              {
                acceptNode(element: Element) {
                  return element.localName === "form"
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
                },
              },
          );
          let formOrAnchor: HTMLAnchorElement | HTMLFormElement;
          while (
            (formOrAnchor = nodes.nextNode() as
              HTMLAnchorElement | HTMLFormElement)
          ) {
            this.registerFormEvent(formOrAnchor as HTMLFormElement);
          }
        }
      }
    }).observe(body, { childList: true, subtree: true });
  }

  attach(router: BrowserRouterLike) {
    this.router = router;
  }

  private registerFormEvent(form: HTMLFormElement) {
    if (this.registeredElements.has(form)) return;
    this.registeredElements.add(form);

    form.addEventListener("submit", (event) => {
      const router = this.router;
      if (!router || !router.options.formHandler) return;
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
        .then((response) => router.options.formHandler!(response, event))
        .catch(async (error) => {
          if (router.options.errorHandler) {
            await router.options.errorHandler(error, event);
          } else {
            console.error(error, event);
          }
        });
    });
  }
}
