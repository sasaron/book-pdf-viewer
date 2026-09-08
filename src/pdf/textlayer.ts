import type { PageViewport, PDFPageProxy } from "pdfjs-dist";
import { setLayerDimensions, TextLayer } from "pdfjs-dist";

export type TextLayerHandle = {
    element: HTMLElement;
    render(): Promise<void>;
    cancel(): void;
};

export function createTextLayer(page: PDFPageProxy, viewport: PageViewport): TextLayerHandle {
    const element = document.createElement("div");
    element.className = "textLayer";
    setLayerDimensions(element, viewport);

    const layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: element,
        viewport,
    });

    return {
        element,
        render: () => layer.render(),
        cancel: () => layer.cancel(),
    };
}
