/** 音声一覧は非同期に揃う。最初の1回だけ待つ。 */
function voices(): Promise<SpeechSynthesisVoice[]> {
    const list = speechSynthesis.getVoices();

    if (list.length > 0) {
        return Promise.resolve(list);
    }

    return new Promise((resolvePromise) => {
        speechSynthesis.addEventListener(
            "voiceschanged",
            () => resolvePromise(speechSynthesis.getVoices()),
            { once: true },
        );
        // 音声が1つも無いブラウザでも待ち続けない
        setTimeout(() => resolvePromise(speechSynthesis.getVoices()), 1000);
    });
}

export type SpeakerOptions = {
    sentencesFor(page: number): Promise<string[]>;
    nextPage(): Promise<number | null>;
    onChange(speaking: boolean): void;
    onNotice(message: string): void;
};

export type Speaker = {
    speaking: boolean;
    advancing: boolean;
    start(page: number): Promise<void>;
    stop(): void;
    toggle(page: number): void;
};

/**
 * 読み上げを回す。
 *
 * sentencesFor でページの文を受け取り、順に喋る。ページを読み終えたら
 * nextPage で次に送り、そのまま続ける。読むものが無いページ（コードだけの
 * ページなど）は黙って飛ばすが、いつまでも飛ばし続けないよう上限を置く。
 */
export function createSpeaker({
    sentencesFor,
    nextPage,
    onChange,
    onNotice,
}: SpeakerOptions): Speaker {
    const EMPTY_LIMIT = 5;

    let queue: string[] = [];
    let empty = 0;
    let voice: SpeechSynthesisVoice | null = null;
    let keepAlive: ReturnType<typeof setInterval> | null = null;

    const speaker: Speaker = {
        speaking: false,
        // 自動でページを送っている間だけ立つ。この送りでは読み上げを止めない
        advancing: false,
        start,
        stop,
        toggle,
    };

    function change(): void {
        onChange(speaker.speaking);
    }

    /*
     * Chrome は15秒ほどで勝手に黙る。pause と resume を挟むと続く。
     * Safari では要らないうえに雑音の元になるので、Chrome のときだけ。
     */
    function startKeepAlive(): void {
        if (keepAlive !== null || !navigator.userAgent.includes("Chrome")) {
            return;
        }

        keepAlive = setInterval(() => {
            speechSynthesis.pause();
            speechSynthesis.resume();
        }, 5000);
    }

    function stopKeepAlive(): void {
        if (keepAlive !== null) {
            clearInterval(keepAlive);
        }
        keepAlive = null;
    }

    function stop(): void {
        if (!speaker.speaking) {
            return;
        }

        speaker.speaking = false;
        queue = [];
        stopKeepAlive();
        speechSynthesis.cancel();
        change();
    }

    async function fill(page: number | null): Promise<void> {
        queue = page === null ? [] : await sentencesFor(page);
        empty = queue.length === 0 ? empty + 1 : 0;
    }

    async function speakNext(): Promise<void> {
        while (speaker.speaking && queue.length === 0) {
            if (empty >= EMPTY_LIMIT) {
                stop();
                onNotice(`${EMPTY_LIMIT}ページ続けて読む本文が無かったので止めた。`);
                return;
            }

            speaker.advancing = true;

            try {
                const page = await nextPage();

                if (page === null) {
                    stop();
                    return;
                }

                await fill(page);
            } finally {
                speaker.advancing = false;
            }
        }

        if (!speaker.speaking) {
            return;
        }

        const utterance = new SpeechSynthesisUtterance(queue.shift());
        utterance.lang = "ja-JP";

        if (voice !== null) {
            utterance.voice = voice;
        }

        utterance.addEventListener("end", () => {
            speakNext().catch(fail);
        });
        utterance.addEventListener("error", (event) => {
            // 自分で cancel したときも error として届く。そのときは何も言わない
            if (event.error === "interrupted" || event.error === "canceled") {
                return;
            }

            /*
             * 読めないまま次へ行くと、音が出ないままページだけが進んでしまう。
             * 1文でも失敗したら止めて、何が起きたかを出す。
             */
            stop();
            onNotice(`読み上げに失敗した: ${event.error}`);
        });

        speechSynthesis.speak(utterance);
    }

    async function start(page: number): Promise<void> {
        stop();

        // 音声一覧を待つ間に押し直されることがある。先に立てて、待ったあとで見る
        speaker.speaking = true;
        empty = 0;
        change();

        if (voice === null) {
            const list = await voices();

            if (!speaker.speaking) {
                return;
            }

            if (list.length === 0) {
                stop();
                onNotice("このブラウザに読み上げ用の音声が入っていない。");
                return;
            }

            // 日本語の音声が無ければ、lang だけ指定してブラウザの既定に任せる
            voice = list.find((entry) => entry.lang.replace("_", "-").startsWith("ja")) ?? null;
        }

        startKeepAlive();
        await fill(page);

        if (speaker.speaking) {
            await speakNext();
        }
    }

    function toggle(page: number): void {
        if (speaker.speaking) {
            stop();
            return;
        }

        start(page).catch(fail);
    }

    function fail(error: unknown): void {
        stop();
        onNotice(
            `読み上げを続けられなかった: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    // 読み上げたまま再読み込みすると、次のページでも喋り続ける
    window.addEventListener("pagehide", () => speechSynthesis.cancel());

    return speaker;
}
