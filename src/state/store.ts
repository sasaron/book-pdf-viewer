export type Listener<T> = (state: Readonly<T>) => void;

export type Store<T> = {
    get(): Readonly<T>;
    set(patch: Partial<T>): void;
    subscribe(listener: Listener<T>): () => void;
};

export function createStore<T extends object>(initial: T): Store<T> {
    let state = initial;
    const listeners = new Set<Listener<T>>();

    return {
        get: () => state,

        set(patch) {
            const keys = Object.keys(patch) as (keyof T)[];
            if (!keys.some((key) => state[key] !== patch[key])) {
                return;
            }
            state = { ...state, ...patch };
            for (const listener of listeners) {
                listener(state);
            }
        },

        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
