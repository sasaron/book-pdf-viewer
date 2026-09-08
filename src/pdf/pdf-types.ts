import type { PDFDocumentProxy } from "pdfjs-dist";

export type RawOutline = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>;

export type RawOutlineItem = RawOutline[number];
