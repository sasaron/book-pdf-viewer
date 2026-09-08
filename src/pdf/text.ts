import type { PDFDocumentProxy } from "pdfjs-dist";
import { pageSentences } from "../speech/extract.ts";

export async function sentencesForPage(
    doc: PDFDocumentProxy,
    pageNumber: number,
): Promise<string[]> {
    try {
        const page = await doc.getPage(pageNumber);

        return pageSentences(await page.getTextContent(), page.getViewport({ scale: 1 }).height);
    } catch {
        return [];
    }
}
