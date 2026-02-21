import React from "react";
import { useConnectedParams } from "./ConnectedParamsContext";

// Takes the node id (not data) and returns a lookup function.
// Reading from ConnectedParamsContext — no node.data pollution needed.
export function useConnectedParamChecker(nodeId: string) {
    const map = useConnectedParams();
    const set = map.get(nodeId);
    return React.useCallback(
        (key: string): boolean => set?.has(key) ?? false,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [set],
    );
}
