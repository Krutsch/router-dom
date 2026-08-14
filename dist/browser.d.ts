import type { LooseObject, RouterOptions } from "./types.js";
export interface BrowserPlatform {
    readonly document: Document;
    readonly base: string;
    currentUrl(): string;
    currentHref(): string;
    currentState(): LooseObject | undefined;
    push(path: string, state: LooseObject): void;
    setManualScrollRestoration(): void;
    saveScroll(url: string): void;
    finishScroll(url: string, restoreScroll: boolean, behavior?: ScrollBehavior): void;
    isHMR(): boolean;
    shouldPrefetch(): boolean;
    scheduleIdle(callback: () => void): void;
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    outlet(): Element | null;
    removeServerRouteMarker(outlet: Element): void;
    dispatch(name: string): void;
    onPopState(listener: (event: PopStateEvent) => void): void;
    onBeforeUnload(listener: () => void): void;
}
export declare function createBrowserPlatform(): BrowserPlatform;
export interface BrowserRouterLike {
    options: RouterOptions;
    go(path: string, state?: LooseObject): void;
    doRouting(to?: string, event?: PopStateEvent, adopt?: boolean): Promise<void>;
}
export declare function attachBrowserShell(router: BrowserRouterLike, platform: BrowserPlatform): void;
