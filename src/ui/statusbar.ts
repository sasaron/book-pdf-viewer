export type Statusbar = {
    info(message: string): void;
    error(message: string): void;
    clear(): void;
};

export function createStatusbar(element: HTMLElement): Statusbar {
    const set = (message: string, isError: boolean): void => {
        element.textContent = message;
        element.classList.toggle("is-error", isError);
    };

    return {
        info: (message) => set(message, false),
        error: (message) => set(message, true),
        clear: () => set("", false),
    };
}
