import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

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
    task: PDFDocumentLoadingTask;
    outline: OutlineNode[] | null;
    view: DocumentView;
};

export type Bookmark = {
    page: number;
    label: string;
};

export type OutlineNode = {
    title: string;
    page: number | null;
    depth: number;
    children: OutlineNode[];
};

export type ViewerState = {
    docId: DocId | null;
    name: string;
    page: number;
    numPages: number;
    scale: number;
    fit: boolean;
    bookmarked: boolean;
    speaking: boolean;
    sidebarCollapsed: boolean;
};
