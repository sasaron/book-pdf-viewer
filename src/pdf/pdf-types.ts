import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export type RawOutline = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>;

export type RawOutlineItem = RawOutline[number];

export type TextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;

export type TextContentItem = TextContent["items"][number];

export type TextItem = Extract<TextContentItem, { str: string }>;

export type TextStyles = TextContent["styles"];
