export interface TemplateRoute {
    templateUrl?: string;
    element?: Node | string;
}
export interface RenderableRoute {
    chain: readonly TemplateRoute[];
    pathname: string;
}
export interface TemplateLoader {
    load(route: TemplateRoute): Promise<string>;
}
export interface RenderAdapter {
    findOutlet(where: Element): Element | null;
    clone(where: Element): Element;
    append(outlet: Element, content: Node | string): void;
    clear(outlet: Element): void;
    commit(copy: Element, where: Element): void;
    supportsViewTransitions(): boolean;
    commitWithViewTransition(update: () => void): Promise<void>;
}
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export declare function createTemplateLoader(fetcher: Fetcher, isHMR: () => boolean): TemplateLoader;
export declare class RouteRenderer {
    private readonly templates;
    private readonly dom;
    constructor(templates: TemplateLoader, dom: RenderAdapter);
    render(route: RenderableRoute, currentRoute: RenderableRoute | undefined, where: Element, isCurrent: () => boolean, viewTransitions?: boolean): Promise<void>;
    prefetch(route: TemplateRoute): Promise<string>;
}
export declare function createHydroRenderAdapter(document: Document): RenderAdapter;
export {};
