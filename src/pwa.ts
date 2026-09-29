export type ServiceWorkerEvents = {
    onUpdateReady(): void;
};

export async function registerServiceWorker(events: ServiceWorkerEvents): Promise<void> {
    const registration = await navigator.serviceWorker.register("./sw.js");
    if (navigator.serviceWorker.controller === null) {
        return;
    }

    const watch = (worker: ServiceWorker | null): void => {
        if (worker === null) {
            return;
        }
        if (worker.state === "installed") {
            events.onUpdateReady();
            return;
        }
        worker.addEventListener("statechange", () => {
            if (worker.state === "installed") {
                events.onUpdateReady();
            }
        });
    };

    // updatefound だけを待たない。ナビゲーション時の更新確認は register の完了より先に走りうる
    watch(registration.waiting ?? registration.installing);
    registration.addEventListener("updatefound", () => watch(registration.installing));
}
