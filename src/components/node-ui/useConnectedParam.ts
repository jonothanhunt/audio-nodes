import React from "react";

// Simplified: rely solely on stable `_connectedParams` array injected by the editor.
// In dev, warn once if `_connectedParams` is missing so future node authors notice.
let warned = false;
export function useConnectedParamChecker(data: unknown) {
    const arr = (data as { _connectedParams?: string[] })?._connectedParams;
    React.useEffect(() => {
        if (!warned && !Array.isArray(arr)) {
            console.warn("useConnectedParamChecker: _connectedParams missing; initialize it to [] when constructing node data.");
            warned = true;
        }
    }, [arr]);
    return React.useCallback(
        (key: string): boolean => Array.isArray(arr) ? arr.includes(key) : false,
        [arr],
    );
}
