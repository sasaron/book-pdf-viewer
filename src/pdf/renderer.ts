import type { PageViewport, PDFPageProxy } from "pdfjs-dist";
import type { OpenDocument } from "../state/types.ts";

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

const MAX_CANVAS_AREA_DEFAULT = 268_435_456;
const MAX_CANVAS_AREA_SAFARI = 16_777_216;

function maxCanvasArea(): number {
    const ua = navigator.userAgent;
    const isSafari = ua.includes("Safari") && !/Chrom(e|ium)/.test(ua);
    return isSafari ? MAX_CANVAS_AREA_SAFARI : MAX_CANVAS_AREA_DEFAULT;
}

function pixelRatio(viewport: PageViewport): number {
    const ratio = window.devicePixelRatio || 1;
    const area = viewport.width * viewport.height;
    if (area <= 0) {
        return ratio;
    }
    const max = maxCanvasArea();
    if (area * ratio * ratio <= max) {
        return ratio;
    }
    return Math.sqrt(max / area);
}

export function fitScale(page: PDFPageProxy, viewer: HTMLElement): number {
    const styles = getComputedStyle(viewer);
    const available =
        viewer.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);

    if (!(available > 0)) {
        return 1;
    }

    const width = page.getViewport({ scale: 1 }).width;
    return Math.min(Math.max(available / width, MIN_SCALE), MAX_SCALE);
}

export async function renderPage(
    opened: OpenDocument,
    pageNumber: number,
    viewer: HTMLElement,
): Promise<void> {
    const target = Math.min(Math.max(pageNumber, 1), opened.numPages);
    opened.view.page = target;

    const page = await opened.doc.getPage(target);
    const scale = opened.view.fit ? fitScale(page, viewer) : opened.view.scale;
    opened.view.scale = scale;

    const viewport = page.getViewport({ scale });
    const ratio = pixelRatio(viewport);

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;

    const task = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });

    try {
        await task.promise;
    } finally {
        page.cleanup();
    }

    viewer.replaceChildren(canvas);
    viewer.scrollTop = 0;
}
