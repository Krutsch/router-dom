import type { LooseObject, RouterOptions } from "./types.js";
export interface BrowserPlatform {
    readonly document: Document;
    readonly base: string;
    currentUrl(): string;
    currentHref(): string;
    currentState(): LooseObject | undefined;
    push(path: string, state: LooseObject): void;
    setNativeScrollRestoration(): void;
    setManualScrollRestoration(): void;
    finishScroll(restoreScroll: boolean, isTraversal: boolean, behavior?: ScrollBehavior): void;
    restoreInitialScroll(): void;
    isHMR(): boolean;
    shouldPrefetch(): boolean;
    scheduleIdle(callback: () => void): void;
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    outlet(): Element | null;
    removeServerRouteMarker(outlet: Element): void;
    dispatch(name: string): void;
    onPopState(listener: (event: PopStateEvent) => void): void;
}
export declare function createBrowserPlatform(): BrowserPlatform;
export interface BrowserRouterLike {
    options: RouterOptions;
    go(path: string, state?: LooseObject): void;
    doRouting(to?: string, event?: PopStateEvent, adopt?: boolean): Promise<void>;
}
export declare function attachBrowserShell(router: BrowserRouterLike, platform: BrowserPlatform): void;
