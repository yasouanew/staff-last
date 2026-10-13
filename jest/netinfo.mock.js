/**
 * Jest stand-in for `@react-native-community/netinfo`.
 *
 * The real package reaches a native TurboModule at import time, which does not exist
 * under Jest. This mock mirrors the small surface the connectivity coordinator uses:
 *
 * - `addEventListener` — returns an unsubscribe function, exactly like the real API.
 * - `fetch` — resolves the current state.
 * - `useNetInfo` — a hook-shaped stub for any component that reads it.
 *
 * Tests that need to drive an offline → online transition call
 * `__emitNetInfoState(...)` (exported below) to invoke the registered listener.
 */

/** Listeners registered through `addEventListener`. */
const listeners = new Set();

/** The state `fetch()` resolves with; tests can override it. */
let currentState = {
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: { isConnectionExpensive: false },
};

function addEventListener(listener) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

function fetch() {
    return Promise.resolve(currentState);
}

function configure() {
    // No-op: there is no native configuration under Jest.
}

function useNetInfo() {
    return currentState;
}

/**
 * Test helper: pushes a state to every registered listener and updates the value
 * `fetch()` returns. Not part of the real API.
 */
function __emitNetInfoState(next) {
    currentState = { ...currentState, ...next };

    for (const listener of listeners) {
        listener(currentState);
    }
}

/** Test helper: clears listeners and restores the default online state. */
function __resetNetInfo() {
    listeners.clear();
    currentState = {
        type: 'wifi',
        isConnected: true,
        isInternetReachable: true,
        details: { isConnectionExpensive: false },
    };
}

const NetInfoStateType = {
    unknown: 'unknown',
    none: 'none',
    cellular: 'cellular',
    wifi: 'wifi',
    bluetooth: 'bluetooth',
    ethernet: 'ethernet',
    wimax: 'wimax',
    vpn: 'vpn',
    other: 'other',
};

const netInfo = {
    addEventListener,
    fetch,
    configure,
    useNetInfo,
    NetInfoStateType,
    __emitNetInfoState,
    __resetNetInfo,
};

module.exports = netInfo;
module.exports.default = netInfo;
module.exports.addEventListener = addEventListener;
module.exports.fetch = fetch;
module.exports.configure = configure;
module.exports.useNetInfo = useNetInfo;
module.exports.NetInfoStateType = NetInfoStateType;
module.exports.__emitNetInfoState = __emitNetInfoState;
module.exports.__resetNetInfo = __resetNetInfo;
