export type KeyboardActions = {
    onStep(delta: number): void;
    onZoom(direction: number): void;
    onToggleSidebar(): void;
    onEscape(): void;
};

export function createKeyboard(actions: KeyboardActions): void {
    document.addEventListener("keydown", (event) => {
        if (event.target instanceof HTMLInputElement) {
            return;
        }

        switch (event.key) {
            case "Escape":
                actions.onEscape();
                return;
            case "[":
                actions.onToggleSidebar();
                return;
            case "ArrowLeft":
                actions.onStep(-1);
                return;
            case "ArrowRight":
                actions.onStep(1);
                return;
            case "+":
            case "=":
                actions.onZoom(1);
                return;
            case "-":
                actions.onZoom(-1);
                return;
            default:
                return;
        }
    });
}
