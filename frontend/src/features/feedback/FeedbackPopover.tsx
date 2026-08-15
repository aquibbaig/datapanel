import { useEffect, useRef, useState } from "react";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import { Button } from "../../components/ui/Button";
import { textInputBehaviorProps } from "../../lib/text-input";
import {
  buildFeedbackIssueUrl,
  maxFeedbackLength,
} from "./lib/githubIssue";

interface Props {
  version?: string;
}

interface WailsRuntimeWindow extends Window {
  runtime?: {
    BrowserOpenURL?: unknown;
  };
}

export function FeedbackPopover({ version }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canContinue = message.trim().length > 0;

  useEffect(() => {
    if (!open) return undefined;

    const focusFrame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function continueToGitHub() {
    const feedback = message.trim();
    if (!feedback) return;

    openExternalUrl(buildFeedbackIssueUrl(feedback, version));
    setMessage("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="rounded-full px-3 text-zinc-300"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        Feedback
      </Button>

      {open ? (
        <div
          aria-label="Share feedback"
          className="absolute left-0 top-[calc(100%+10px)] z-50 w-[380px] overflow-hidden rounded-lg border border-line bg-surface-850 shadow-2xl"
          role="dialog"
        >
          <div className="p-4">
            <textarea
              {...textInputBehaviorProps}
              ref={textareaRef}
              aria-label="Feedback"
              className="h-32 resize-none bg-surface-900 p-3 font-sans text-sm leading-5 text-zinc-100 placeholder:text-muted"
              maxLength={maxFeedbackLength}
              placeholder="How can we improve DataPanel?"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.key === "Enter"
                ) {
                  event.preventDefault();
                  continueToGitHub();
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-900/50 px-4 py-3">
            <span className="text-xs text-muted">
              Review and submit on GitHub
            </span>
            <Button
              disabled={!canContinue}
              type="button"
              variant="primary"
              onClick={continueToGitHub}
            >
              Continue to GitHub
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function openExternalUrl(url: string) {
  if ((window as WailsRuntimeWindow).runtime?.BrowserOpenURL) {
    BrowserOpenURL(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
