import { nodeForPage } from "../pdf/outline.ts";
import type { OutlineNode } from "../state/types.ts";

const COLLAPSE_FROM_DEPTH = 2;

export type OutlineActions = {
    onJump(page: number): void;
};

export type OutlineView = {
    render(nodes: readonly OutlineNode[]): void;
    highlight(page: number): void;
    clear(): void;
};

type Row = {
    node: OutlineNode;
    button: HTMLButtonElement;
    parent: Row | null;
    expand(): void;
};

function createMessage(text: string): HTMLElement {
    const p = document.createElement("p");
    p.className = "outline-empty";
    p.textContent = text;
    return p;
}

export function createOutlineView(container: HTMLElement, actions: OutlineActions): OutlineView {
    let rows: Row[] = [];
    let current: HTMLButtonElement | null = null;

    function buildNode(node: OutlineNode, parent: Row | null): HTMLElement {
        const wrap = document.createElement("div");
        wrap.className = "outline-node";

        const line = document.createElement("div");
        line.className = "outline-line";
        line.dataset.depth = String(node.depth);

        const twisty = document.createElement("button");
        twisty.type = "button";
        twisty.className = "outline-twisty";

        const button = document.createElement("button");
        button.className = "outline-item";
        button.type = "button";
        button.dataset.depth = String(node.depth);

        const no = document.createElement("span");
        no.className = "outline-no";
        no.textContent = node.page === null ? "" : String(node.page);

        const title = document.createElement("span");
        title.className = "outline-title";
        title.textContent = node.title;

        button.append(no, title);

        if (node.page === null) {
            button.classList.add("no-page");
            button.disabled = true;
        } else {
            const page = node.page;
            button.title = `${page} ページを開く`;
            button.addEventListener("click", () => actions.onJump(page));
        }

        const children = document.createElement("div");
        children.className = "outline-children";

        const row: Row = {
            node,
            button,
            parent,
            expand() {
                if (node.children.length > 0) {
                    children.hidden = false;
                    twisty.setAttribute("aria-expanded", "true");
                }
                parent?.expand();
            },
        };
        rows.push(row);

        if (node.children.length === 0) {
            twisty.className = "outline-twisty is-leaf";
            twisty.disabled = true;
            twisty.setAttribute("aria-hidden", "true");
        } else {
            const collapsed = node.depth >= COLLAPSE_FROM_DEPTH - 1;
            children.hidden = collapsed;
            twisty.setAttribute("aria-expanded", String(!collapsed));
            twisty.title = "折り畳みを切り替える";
            twisty.addEventListener("click", () => {
                children.hidden = !children.hidden;
                twisty.setAttribute("aria-expanded", String(!children.hidden));
            });
            children.append(...node.children.map((child) => buildNode(child, row)));
        }

        line.append(twisty, button);
        wrap.append(line, children);
        return wrap;
    }

    return {
        render(nodes) {
            rows = [];
            current = null;

            if (nodes.length === 0) {
                container.replaceChildren(createMessage("この PDF は目次を持っていません。"));
                return;
            }

            container.replaceChildren(...nodes.map((node) => buildNode(node, null)));
        },

        highlight(page) {
            const target = nodeForPage(
                rows.map(({ node }) => node).filter((node) => node.depth === 0),
                page,
            );

            current?.removeAttribute("aria-current");
            current = null;

            if (target === null) {
                return;
            }

            const row = rows.find((candidate) => candidate.node === target);
            if (row === undefined) {
                return;
            }

            row.button.setAttribute("aria-current", "true");
            row.parent?.expand();
            current = row.button;
            row.button.scrollIntoView({ block: "nearest" });
        },

        clear() {
            rows = [];
            current = null;
            container.replaceChildren();
        },
    };
}
