import { isPdf, openFile } from "./pdf/loader.ts";
import { renderPage } from "./pdf/renderer.ts";
import type { OpenDocument } from "./state/types.ts";
import { createDropzone } from "./ui/dropzone.ts";
import { createStatusbar } from "./ui/statusbar.ts";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";

function required<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (element === null) {
        throw new Error(`missing element: ${selector}`);
    }
    return element;
}

const viewer = required<HTMLElement>("#viewer");
const docName = required<HTMLElement>("#doc-name");
const openButton = required<HTMLButtonElement>("#open");
const fileInput = required<HTMLInputElement>("#file");

const statusbar = createStatusbar(required<HTMLElement>("#statusbar"));

let active: OpenDocument | null = null;

async function open(files: File[]): Promise<void> {
    const pdfs = files.filter(isPdf);
    if (pdfs.length === 0) {
        statusbar.error("PDF ではありません");
        return;
    }

    const file = pdfs[pdfs.length - 1];
    statusbar.info(`${file.name} を読み込み中…`);

    try {
        const started = performance.now();
        active = await openFile(file);
        await renderPage(active, active.view.page, viewer);
        docName.textContent = active.name;
        statusbar.info(
            `${active.numPages} ページ / ${Math.round(performance.now() - started)}ms / ${active.id}`,
        );
    } catch (error) {
        active = null;
        statusbar.error(`開けませんでした: ${error instanceof Error ? error.message : error}`);
    }
}

createDropzone(document.body, { onFiles: (files) => void open(files) });

openButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    void open(Array.from(fileInput.files ?? []));
    fileInput.value = "";
});
