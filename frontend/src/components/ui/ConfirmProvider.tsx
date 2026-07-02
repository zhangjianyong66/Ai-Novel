import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "./Modal";
import { ConfirmContext } from "./confirm";
import { shouldResetConfirmOptions } from "./confirmProviderState";
import type { ChooseOptions, ConfirmApi, ConfirmChoice, ConfirmOptions } from "./confirm";

export function ConfirmProvider(props: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<"confirm" | "choose">("confirm");
  const [options, setOptions] = useState<ConfirmOptions | ChooseOptions | null>(null);
  const resolverRef = useRef<((value: unknown) => void) | null>(null);
  const optionsVersionRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const clearResetTimer = useCallback(() => {
    if (!resetTimerRef.current) return;
    window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
  }, []);

  const openConfirm = useCallback(
    (opts: ConfirmOptions | ChooseOptions) => {
      clearResetTimer();
      optionsVersionRef.current += 1;
      setOptions(opts);
      setOpen(true);
    },
    [clearResetTimer],
  );

  const confirm = useCallback(
    async (opts: ConfirmOptions) => {
      setVariant("confirm");
      openConfirm(opts);
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve as (value: unknown) => void;
      });
    },
    [openConfirm],
  );

  const choose = useCallback(
    async (opts: ChooseOptions) => {
      setVariant("choose");
      openConfirm(opts);
      return new Promise<ConfirmChoice>((resolve) => {
        resolverRef.current = resolve as (value: unknown) => void;
      });
    },
    [openConfirm],
  );

  const close = useCallback(
    (value: unknown) => {
      clearResetTimer();
      setOpen(false);
      const resetVersion = optionsVersionRef.current;
      const resolve = resolverRef.current;
      resolverRef.current = null;
      resolve?.(value);
      resetTimerRef.current = window.setTimeout(() => {
        if (shouldResetConfirmOptions(resetVersion, optionsVersionRef.current)) {
          setOptions(null);
        }
        resetTimerRef.current = null;
      }, 400);
    },
    [clearResetTimer],
  );

  useEffect(() => clearResetTimer, [clearResetTimer]);

  const api = useMemo<ConfirmApi>(() => ({ confirm, choose }), [choose, confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {props.children}
      <Modal
        open={open && Boolean(options)}
        onClose={() => close(variant === "choose" ? ("cancel" satisfies ConfirmChoice) : false)}
        panelClassName="surface max-w-md p-5"
        ariaLabel={options?.title ?? "确认"}
      >
        {options ? (
          <>
            <div className="font-content text-xl text-ink">{options.title}</div>
            {options.description ? <div className="mt-2 text-sm text-subtext">{options.description}</div> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => close(variant === "choose" ? ("cancel" satisfies ConfirmChoice) : false)}
                type="button"
              >
                {options.cancelText ?? "取消"}
              </button>
              {variant === "choose" ? (
                <button
                  className={(options as ChooseOptions).secondaryDanger ? "btn btn-danger" : "btn btn-secondary"}
                  onClick={() => close("secondary" satisfies ConfirmChoice)}
                  type="button"
                >
                  {(options as ChooseOptions).secondaryText}
                </button>
              ) : null}
              <button
                className={options.danger ? "btn btn-danger" : "btn btn-primary"}
                onClick={() => close(variant === "choose" ? ("confirm" satisfies ConfirmChoice) : true)}
                type="button"
              >
                {options.confirmText ?? "确认"}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </ConfirmContext.Provider>
  );
}
