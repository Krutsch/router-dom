export interface NavigationCallbacks {
  base: string;
  onNavigate(
    url: string,
    event: NavigateEvent,
    state: unknown,
  ): Promise<void> | void;
  getAnchorState(anchor: HTMLAnchorElement): unknown;
}

let callbacks: NavigationCallbacks;
let installedNavigation: Navigation | undefined;

export function setupNavigation(nextCallbacks: NavigationCallbacks): Navigation {
  const navigationApi = window.navigation;
  if (
    !navigationApi ||
    typeof navigationApi.navigate !== "function" ||
    typeof NavigateEvent !== "function" ||
    typeof NavigateEvent.prototype.intercept !== "function"
  ) {
    throw new Error("router-dom requires the Navigation API");
  }

  callbacks = nextCallbacks;
  if (installedNavigation === navigationApi) return navigationApi;

  navigationApi.addEventListener("navigate", handleNavigate);
  document.addEventListener("click", handleAnchorClick);
  installedNavigation = navigationApi;
  return navigationApi;
}

function handleNavigate(event: NavigateEvent) {
  if (
    !event.canIntercept ||
    event.hashChange ||
    event.downloadRequest !== null ||
    isFormNavigation(event)
  ) {
    return;
  }

  const destination = new URL(event.destination.url);
  const currentCallbacks = callbacks;
  if (
    destination.origin !== location.origin ||
    !["http:", "https:"].includes(destination.protocol)
  ) {
    return;
  }

  const navigationUrl = getNavigationUrl(destination, currentCallbacks.base);
  const state =
    event.info === undefined ? event.destination.getState() : event.info;
  if (navigationUrl !== destination.href) {
    event.preventDefault();
    void navigationNavigate(navigationUrl, state);
    return;
  }

  if (
    event.navigationType !== "traverse" &&
    navigationUrl === location.href
  ) {
    event.preventDefault();
    return;
  }

  event.intercept({
    focusReset: "manual",
    scroll: "manual",
    handler: () =>
      currentCallbacks.onNavigate(
        destination.pathname + destination.search + destination.hash,
        event,
        state,
      ),
  });
}

function handleAnchorClick(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const anchor = getAnchor(event.target);
  if (!anchor) return;

  const href = anchor.getAttribute("href");
  const target = anchor.getAttribute("target");
  if (
    href === null ||
    target !== null && target !== "_self" ||
    anchor.hasAttribute("download")
  ) {
    return;
  }

  const destination = new URL(href, location.href);
  if (
    destination.origin !== location.origin ||
    !["http:", "https:"].includes(destination.protocol) ||
    (destination.hash &&
      destination.pathname === location.pathname &&
      destination.search === location.search)
  ) {
    return;
  }

  const navigationUrl = getNavigationUrl(destination, callbacks.base);
  if (navigationUrl === location.href) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  void navigationNavigate(
    navigationUrl,
    callbacks.getAnchorState(anchor),
  );
}

function navigationNavigate(url: string, state: unknown) {
  const navigationApi = installedNavigation;
  if (!navigationApi) return Promise.resolve();
  return (
    navigationApi.navigate(url, { state: cloneState(state) }).finished?.catch(() => {}) ??
    Promise.resolve()
  );
}

function getNavigationUrl(destination: URL, basePath: string) {
  if (
    !basePath ||
    destination.pathname === basePath ||
    destination.pathname.startsWith(`${basePath}/`)
  ) {
    return destination.href;
  }

  const pathname = `${basePath}/${destination.pathname.replace(/^\/+/, "")}`;
  return new URL(
    `${pathname}${destination.search}${destination.hash}`,
    destination.origin,
  ).href;
}

function cloneState(state: unknown) {
  return state && typeof state === "object"
    ? { ...(state as Record<string, unknown>) }
    : state;
}

function getAnchor(target: EventTarget | null): HTMLAnchorElement | undefined {
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a");
  return anchor instanceof HTMLAnchorElement ? anchor : undefined;
}

function isFormNavigation(event: NavigateEvent) {
  if (event.formData !== null) return true;

  const source = event.sourceElement;
  return (
    source instanceof HTMLFormElement ||
    source instanceof HTMLButtonElement && source.form !== null ||
    source instanceof HTMLInputElement && source.form !== null
  );
}
