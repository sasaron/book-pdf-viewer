import type { PageViewport, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { RenderingCancelledException } from "pdfjs-dist";
import type { OpenDocument } from "../state/types.ts";
import { createTextLayer, type TextLayerHandle } from "./textlayer.ts";

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 4;
export const SCALE_STEP = 0.2;

const MAX_CANVAS_AREA_DEFAULT = 268_435_456;
const MAX_CANVAS_AREA_SAFARI = 16_777_216;

const RESIZE_THRESHOLD_PX = 4;
const RESIZE_DEBOUNCE_MS = 120;

export function clampScale(scale: number): number {
    return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

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
    return area * ratio * ratio <= max ? ratio : Math.sqrt(max / area);
}

export function fitScale(page: PDFPageProxy, viewer: HTMLElement): number {
    const styles = getComputedStyle(viewer);
    const available =
        viewer.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);

    if (!(available > 0)) {
        return 1;
    }

    return clampScale(available / page.getViewport({ scale: 1 }).width);
}

function isCancelled(error: unknown): boolean {
    return error instanceof RenderingCancelledException;
}

export type Renderer = {
    render(opened: OpenDocument, pageNumber: number): Promise<void>;
    watchResize(onResize: () => void): void;
};

export function createRenderer(viewer: HTMLElement): Renderer {
    let task: RenderTask | null = null;
    let text: TextLayerHandle | null = null;
    let generation = 0;
    let fitWidth = 0;

    async function render(opened: OpenDocument, pageNumber: number): Promise<void> {
        const target = Math.min(Math.max(pageNumber, 1), opened.numPages);
        opened.view.page = target;

        // getPage の await は cancel できないので、追い越されたことを世代でも見る
        const gen = ++generation;
        task?.cancel();
        text?.cancel();

        const page = await opened.doc.getPage(target);
        if (gen !== generation) {
            return;
        }

        const scale = opened.view.fit ? fitScale(page, viewer) : clampScale(opened.view.scale);
        opened.view.scale = scale;
        if (opened.view.fit) {
            fitWidth = viewer.clientWidth;
        }

        const viewport = page.getViewport({ scale });
        const ratio = pixelRatio(viewport);

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;

        const current = page.render({
            canvas,
            viewport,
            transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        task = current;

        const layer = createTextLayer(page, viewport);
        text = layer;

        try {
            await Promise.all([current.promise, layer.render()]);
        } catch (error) {
            if (isCancelled(error)) {
                return;
            }
            throw error;
        } finally {
            if (task === current) {
                task = null;
            }
        }

        if (gen !== generation) {
            layer.cancel();
            return;
        }

        // setLayerDimensions が幅高さを --total-scale-factor 込みの calc で書くので親が持つ必要がある
        const wrapper = document.createElement("div");
        wrapper.className = "page";
        wrapper.style.setProperty("--total-scale-factor", String(scale));
        wrapper.style.setProperty("--scale-round-x", "1px");
        wrapper.style.setProperty("--scale-round-y", "1px");
        wrapper.append(canvas, layer.element);

        viewer.replaceChildren(wrapper);
        viewer.scrollTop = 0;
    }

    function watchResize(onResize: () => void): void {
        let timer: ReturnType<typeof setTimeout> | undefined;

        new ResizeObserver(() => {
            if (Math.abs(viewer.clientWidth - fitWidth) < RESIZE_THRESHOLD_PX) {
                return;
            }
            clearTimeout(timer);
            timer = setTimeout(onResize, RESIZE_DEBOUNCE_MS);
        }).observe(viewer);
    }

    return { render, watchResize };
}
