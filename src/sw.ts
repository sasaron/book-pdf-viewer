declare const __PRECACHE__: readonly string[];
declare const __VERSION__: string;

// export {} を置いてモジュールにしない。classic の Service Worker として登録するので
// export 文が残ると読み込めない。その代わり self を再宣言できず、as で寄せる
const scope = self as unknown as ServiceWorkerGlobalScope;

const PREFIX = "pdf-viewer-";
const CACHE = `${PREFIX}${__VERSION__}`;

// skipWaiting しない。開いている窓は古い版のチャンク名で動いているので、
// 途中で入れ替えると動的に取りに行くファイルが新しいキャッシュに無い
scope.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(__PRECACHE__)));
});

scope.addEventListener("activate", (event) => {
    event.waitUntil(deleteStaleCaches());
});

scope.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
        return;
    }
    event.respondWith(respond(request));
});

// 全部は消さない。github.io は同じユーザーの他の Pages とオリジンを共有する
async function deleteStaleCaches(): Promise<void> {
    const names = await caches.keys();
    await Promise.all(
        names
            .filter((name) => name.startsWith(PREFIX) && name !== CACHE)
            .map((name) => caches.delete(name)),
    );
}

// Vary は見ない。vite preview は Vary: Origin を返し、crossorigin 付きの script と link の
// 要求が addAll で入れたものと一致せず、オフラインで読み込みに失敗した
async function respond(request: Request): Promise<Response> {
    const cache = await caches.open(CACHE);
    const key = request.mode === "navigate" ? "index.html" : request;
    return (await cache.match(key, { ignoreVary: true })) ?? fetch(request);
}
