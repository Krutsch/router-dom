import { hydro } from "hydro-js";
import type { LooseObject, RouterOptions } from "./types.js";

const storageKey = "router-scroll";
const reactivityRegex = /\{\{([^]*?)\}\}/;

export interface BrowserPlatform {
  readonly document: Document;
  readonly base: string;
  currentUrl(): string;
  currentHref(): string;
  currentState(): LooseObject | undefined;
  push(path: string, state: LooseObject): void;
  setNativeScrollRestoration(): void;
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
  onPopState(listener: (event: PopStateEvent) => void): void;
}

export function createBrowserPlatform(): BrowserPlatform {
  const document = window.document;
  let base = document.querySelector("base")?.getAttribute("href") || "";
  if (base.endsWith("/")) base = [...base].slice(0, -1).join("");

  const browserWindow = window as Window & {
    isHMR?: boolean;
    requestIdleCallback?: (callback: () => void) => number;
  };

  window.addEventListener("pagehide", () => {
    history.scrollRestoration = "auto";
  });

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
      return state && Object.keys(state).length ? state : undefined;
    },
    push(path, state) {
      history.pushState({ ...state }, "", path);
    },
    setNativeScrollRestoration() {
      history.scrollRestoration = "auto";
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

      scrollTo({ top: 0, left: 0, behavior });
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
    onPopState(listener) {
      window.addEventListener("popstate", listener);
    },
  };
}

export interface BrowserRouterLike {
  options: RouterOptions;
  go(path: string, state?: LooseObject): void;
  doRouting(to?: string, event?: PopStateEvent, adopt?: boolean): Promise<void>;
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
    if (!body) return;

    new MutationObserver((entries) => {
      for (const entry of entries) {
        for (const node of entry.addedNodes) {
          const nodes = document.createNodeIterator(
            node,
            NodeFilter.SHOW_ELEMENT,
            {
              acceptNode(element: Element) {
                return ["form", "a"].includes(element.localName)
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_REJECT;
              },
            },
          );
          let formOrAnchor: HTMLAnchorElement | HTMLFormElement;
          while (
            (formOrAnchor = nodes.nextNode() as
              | HTMLAnchorElement
              | HTMLFormElement)
          ) {
            if (formOrAnchor.localName === "a") {
              this.registerAnchorEvent(formOrAnchor as HTMLAnchorElement);
            } else {
              this.registerFormEvent(formOrAnchor as HTMLFormElement);
            }
          }
        }
      }
    }).observe(body, { childList: true, subtree: true });
  }

  attach(router: BrowserRouterLike) {
    this.router = router;
  }

  private registerAnchorEvent(anchor: HTMLAnchorElement) {
    if (this.registeredElements.has(anchor)) return;
    this.registeredElements.add(anchor);

    anchor.addEventListener("click", (event: MouseEvent) => {
      const href = anchor.getAttribute("href");
      const target = anchor.getAttribute("target");
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !href ||
        anchor.hasAttribute("download") ||
        (target && target !== "_self")
      ) {
        return;
      }

      const currentUrl = new URL(this.platform.currentHref());
      const url = new URL(href, currentUrl);
      if (
        url.origin !== currentUrl.origin ||
        !["http:", "https:"].includes(url.protocol) ||
        (url.hash &&
          url.pathname === currentUrl.pathname &&
          url.search === currentUrl.search)
      ) {
        return;
      }

      event.preventDefault();
      const data = anchor.getAttribute("data");
      const hydroProp = replaceBars(data);
      const path = url.pathname.startsWith(`${this.platform.base}/`)
        ? url.pathname.slice(this.platform.base.length)
        : url.pathname;
      this.router?.go(
        path + url.search + url.hash,
        data ? hydro[hydroProp!] : undefined,
      );
    });
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

function replaceBars(hydroTerm: string | null) {
  if (hydroTerm === null || !hydroTerm.includes("{{")) return hydroTerm;

  const [_, hydroPath] = hydroTerm.match(reactivityRegex) || [];
  return hydroPath;
}
