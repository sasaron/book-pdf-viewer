export function required<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (element === null) {
        throw new Error(`missing element: ${selector}`);
    }
    return element;
}
