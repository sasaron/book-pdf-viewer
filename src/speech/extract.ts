/**
 * PDF の本文を読み上げる。
 *
 * 3冊ともテキスト層を持っているので、pdf.js の getTextContent から文を組み立て、
 * ブラウザの speechSynthesis に渡すだけで音は出る。難しいのは何を渡さないかで、
 * この module の仕事はほとんどそちらになる。
 *
 * 落とすのは3つ。柱とノンブル、コード、数式や図の破片。
 * 技術書をそのまま読み上げると、コードと数式で文が途切れて聞けたものにならない。
 */

import type { TextContent, TextContentItem, TextItem, TextStyles } from "../pdf/pdf-types.ts";

/** 地の文には必ず入る。1文字も無ければ数式か図のラベルかノンブル。 */
const JAPANESE = /[ぁ-んァ-ヶー一-龠々〆]/;

/** 日本語が無い行は、これより短ければ図のラベルや数式の破片と見なして捨てる。 */
const FRAGMENT_LENGTH = 20;

/** 1回の発話の長さ。長すぎると途中で切られるブラウザがある。 */
const CHUNK_LENGTH = 90;

/** 等幅がこの割合を超える行はコードと見なす。地の文に混じる識別子では超えない。 */
const CODE_RATIO = 0.5;

export type Line = {
    y: number;
    x: number;
    text: string;
    items: [TextItem, ...TextItem[]];
    code: boolean;
};

/**
 * 行を組み立てる。
 *
 * pdf.js が返すのはフォントの切り替わりで刻まれた断片なので、y でまとめ直す。
 * 上付き・下付きは本文と数ポイントずれる。これは別の行のままにしておく。
 * 一緒にすると本文に「2」「n」が挟まって読み上げが濁るし、
 * 別にしておけば後段の破片の判定でまとめて落ちる。
 */
function toLines(textContent: TextContent): Line[] {
    const items = textContent.items
        .filter(
            (item: TextContentItem): item is TextItem => "str" in item && item.str.trim() !== "",
        )
        .sort((a, b) => b.transform[5] - a.transform[5]);

    const lines: Line[] = [];

    for (const item of items) {
        const y = item.transform[5];
        const last = lines.at(-1);
        const tolerance = Math.max(2, (item.height || 10) * 0.3);

        if (last !== undefined && Math.abs(last.y - y) <= tolerance) {
            last.items.push(item);
            continue;
        }

        lines.push({ y, x: 0, text: "", items: [item], code: false });
    }

    for (const line of lines) {
        line.items.sort((a, b) => a.transform[4] - b.transform[4]);
        line.x = line.items[0].transform[4];
        line.text = joinItems(line.items);
    }

    return lines;
}

/** 日本語は詰めて繋ぐ。欧文だけは、離れていれば単語の切れ目として空白を入れる。 */
function joinItems(items: TextItem[]): string {
    let text = "";
    let end: number | null = null;

    for (const item of items) {
        const x = item.transform[4];

        if (
            end !== null &&
            x - end > 1 &&
            /[A-Za-z0-9]$/.test(text) &&
            /^[A-Za-z0-9]/.test(item.str)
        ) {
            text += " ";
        }

        text += item.str;
        end = x + (item.width ?? 0);
    }

    return text;
}

function monoRatio(line: Line, styles: TextStyles): number {
    let mono = 0;
    let total = 0;

    for (const item of line.items) {
        const chars = item.str.replace(/\s/g, "").length;
        total += chars;

        if (styles[item.fontName]?.fontFamily === "monospace") {
            mono += chars;
        }
    }

    return total === 0 ? 0 : mono / total;
}

/** 行間の代表値。柱の見分けとコードブロックの判定に使う。 */
function medianGap(lines: Line[]): number {
    const gaps: number[] = [];
    let above: Line | undefined;

    for (const line of lines) {
        if (above !== undefined) {
            gaps.push(above.y - line.y);
        }
        above = line;
    }

    gaps.sort((a, b) => a - b);

    return gaps[Math.floor(gaps.length / 2)] ?? 0;
}

/**
 * コードブロックの中の日本語コメントを、ブロックの一部として畳む。
 *
 * 「// n回実行」のような行は日本語が主なので等幅の割合では拾えない。
 * 上下の行がどちらもコードで、行間が詰まっていればブロックの中にいる。
 * コードブロックに挟まれた地の文は、上下との間隔が本文の行間より開くので残る。
 */
function fillCodeGaps(lines: Line[], gap: number): void {
    for (const [i, line] of lines.entries()) {
        const prev = lines[i - 1];
        const next = lines[i + 1];

        if (prev === undefined || next === undefined || line.code || !prev.code || !next.code) {
            continue;
        }

        if (prev.y - line.y > gap * 1.6 || line.y - next.y > gap * 1.6) {
            continue;
        }

        line.code = true;
    }
}

/** 行の高さ。行間を測る物差しに使う。ページ全体の行間は図や式で伸び縮みする。 */
function lineHeight(line: Line): number {
    return Math.max(...line.items.map((item) => item.height || 0), 8);
}

/**
 * 柱は、ページの一番上にあって、本文との間に1行分以上の空きを取る。
 * 章扉の見出しはもう少し下に置かれるので、上端の帯に入るものだけを見る。
 */
function isRunningHead(lines: Line[], height: number): boolean {
    const [head, next] = lines;

    if (head === undefined || next === undefined) {
        return false;
    }

    return head.y > height * 0.9 && head.y - next.y > lineHeight(next) * 2;
}

/** 読み上げる行だけを返す。 */
export function readableLines(textContent: TextContent, height: number): Line[] {
    const lines = toLines(textContent);
    const styles = textContent.styles ?? {};
    const gap = medianGap(lines);

    for (const line of lines) {
        // 行頭の // はコードの中のコメント。日本語が主なので等幅の割合では拾えない
        line.code = /^\s*(\/\/|\/\*)/.test(line.text) || monoRatio(line, styles) >= CODE_RATIO;
    }

    fillCodeGaps(lines, gap);

    const head = isRunningHead(lines, height) ? lines[0] : null;

    return lines.filter((line) => {
        if (line === head || line.code) {
            return false;
        }

        // ノンブルはページの下端に置かれる
        if (line.y < height * 0.06) {
            return false;
        }

        return JAPANESE.test(line.text) || line.text.length >= FRAGMENT_LENGTH;
    });
}

/** 行を文につなぐ。日本語は行末で切れているだけなので、そのまま繋ぐ。 */
function joinLines(lines: Line[]): string {
    let text = "";

    for (const line of lines) {
        if (/[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(line.text)) {
            text += " ";
        }

        text += line.text;
    }

    // 両端揃えで字間に空白が入ることがある。読み上げが不自然になるので詰める
    return text.replace(/(?<=[ぁ-ヶ一-龠々〆])[ 　]+(?=[ぁ-ヶ一-龠々〆])/g, "");
}

/** 長い文は読点で切る。読点が無ければ諦めて長さで切る。 */
function split(sentence: string): string[] {
    const out: string[] = [];
    let rest = sentence;

    while (rest.length > CHUNK_LENGTH) {
        const comma = rest.lastIndexOf("、", CHUNK_LENGTH - 1);
        const at = comma > CHUNK_LENGTH / 3 ? comma + 1 : CHUNK_LENGTH;

        out.push(rest.slice(0, at));
        rest = rest.slice(at);
    }

    if (rest !== "") {
        out.push(rest);
    }

    return out;
}

/** ページから発話の単位を作る。読むものが無ければ空になる。 */
export function pageSentences(textContent: TextContent, height: number): string[] {
    const text = joinLines(readableLines(textContent, height));

    return text
        .split(/(?<=[。．！？])/)
        .flatMap((sentence) => split(sentence.trim()))
        .filter((sentence) => JAPANESE.test(sentence) || sentence.length >= FRAGMENT_LENGTH);
}
