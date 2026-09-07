import type { PDFDocumentProxy } from "pdfjs-dist";

export type DocId = string;

export type DocumentView = {
    page: number;
    scale: number;
    fit: boolean;
};

export type OpenDocument = {
    id: DocId;
    name: string;
    numPages: number;
    doc: PDFDocumentProxy;
    view: DocumentView;
};

export type ViewerState = {
    docId: DocId | null;
    name: string;
    page: number;
    numPages: number;
    scale: number;
    fit: boolean;
    sidebarCollapsed: boolean;
};
