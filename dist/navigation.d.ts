export interface NavigationCallbacks {
    base: string;
    onNavigate(url: string, event: NavigateEvent, state: unknown): Promise<void> | void;
    getAnchorState(anchor: HTMLAnchorElement): unknown;
}
export declare function setupNavigation(nextCallbacks: NavigationCallbacks): Navigation;
