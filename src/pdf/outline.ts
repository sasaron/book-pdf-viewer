import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OutlineNode } from "../state/types.ts";
import type { RawOutline, RawOutlineItem } from "./pdf-types.ts";

export type OutlineSource = Pick<
    PDFDocumentProxy,
    "getOutline" | "getDestination" | "getPageIndex"
>;

async function resolvePage(doc: OutlineSource, item: RawOutlineItem): Promise<number | null> {
    try {
        const dest =
            typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;

        if (Array.isArray(dest) && dest[0] !== undefined) {
            return (await doc.getPageIndex(dest[0])) + 1;
        }
    } catch {
        return null;
    }

    return null;
}

async function toNodes(
    doc: OutlineSource,
    items: RawOutline | undefined,
    depth: number,
): Promise<OutlineNode[]> {
    // 数百ノードのPDFで worker とのラウンドトリップを直列にすると目次が数秒出ない
    return Promise.all(
        (items ?? []).map(async (item): Promise<OutlineNode> => {
            const [page, children] = await Promise.all([
                resolvePage(doc, item),
                toNodes(doc, item.items, depth + 1),
            ]);
            return { title: item.title.trim(), page, depth, children };
        }),
    );
}

export async function loadOutline(doc: OutlineSource): Promise<OutlineNode[]> {
    return toNodes(doc, await doc.getOutline(), 0);
}

export function flatten(nodes: readonly OutlineNode[]): OutlineNode[] {
    return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

export function nodeForPage(nodes: readonly OutlineNode[], page: number): OutlineNode | null {
    let best: OutlineNode | null = null;
    let bestPage = 0;

    for (const node of flatten(nodes)) {
        if (node.page !== null && node.page <= page && node.page >= bestPage) {
            best = node;
            bestPage = node.page;
        }
    }

    return best;
}
