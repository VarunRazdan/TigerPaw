import { useState, useCallback, useRef } from "react";
import { invokeToolHttp } from "@/lib/gateway-http";
import { CLOSE_POSITION_TOOLS } from "@/lib/tool-names";

export type CloseStatus =
  | { status: "idle" }
  | { status: "closing" }
  | { status: "closed"; message: string }
  | { status: "error"; message: string };

export type ClosePositionParams = {
  extensionId: string;
  symbol: string;
};

export function useClosePosition(): {
  state: CloseStatus;
  close: (params: ClosePositionParams) => Promise<void>;
  reset: () => void;
} {
  const [state, setState] = useState<CloseStatus>({ status: "idle" });
  const submittingRef = useRef(false);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  const close = useCallback(async (params: ClosePositionParams) => {
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      const toolName = CLOSE_POSITION_TOOLS[params.extensionId];
      if (!toolName) {
        setState({ status: "error", message: `Unknown platform: ${params.extensionId}` });
        return;
      }

      setState({ status: "closing" });

      const result = await invokeToolHttp(toolName, { symbol: params.symbol });

      if (!result.ok) {
        setState({ status: "error", message: result.error });
        return;
      }

      setState({ status: "closed", message: `Closed ${params.symbol}` });
    } finally {
      submittingRef.current = false;
    }
  }, []);

  return { state, close, reset };
}
