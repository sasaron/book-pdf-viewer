type DropzoneOptions = {
    onFiles(files: File[]): void;
};

export function createDropzone(target: HTMLElement, options: DropzoneOptions): void {
    // dragleave はネストした子要素をまたぐたびに飛ぶので、深さを数えないと表示が暴発する
    let depth = 0;

    const setDragging = (dragging: boolean): void => {
        document.body.classList.toggle("dragging", dragging);
    };

    target.addEventListener("dragenter", (event) => {
        event.preventDefault();
        depth += 1;
        setDragging(true);
    });

    target.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer !== null) {
            event.dataTransfer.dropEffect = "copy";
        }
    });

    target.addEventListener("dragleave", (event) => {
        event.preventDefault();
        depth = Math.max(depth - 1, 0);
        if (depth === 0) {
            setDragging(false);
        }
    });

    target.addEventListener("drop", (event) => {
        event.preventDefault();
        depth = 0;
        setDragging(false);
        options.onFiles(Array.from(event.dataTransfer?.files ?? []));
    });
}
