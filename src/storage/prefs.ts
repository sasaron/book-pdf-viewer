const KEY = "pdfviewer:ui";

export type Prefs = {
    sidebarCollapsed: boolean;
};

const DEFAULTS: Prefs = { sidebarCollapsed: false };

export function loadPrefs(): Prefs {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw === null) {
            return { ...DEFAULTS };
        }
        const saved: unknown = JSON.parse(raw);
        if (typeof saved !== "object" || saved === null) {
            return { ...DEFAULTS };
        }
        return { sidebarCollapsed: (saved as Partial<Prefs>).sidebarCollapsed === true };
    } catch {
        return { ...DEFAULTS };
    }
}

export function savePrefs(prefs: Prefs): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
        // 保存できなくても畳めること自体は困らない
    }
}
