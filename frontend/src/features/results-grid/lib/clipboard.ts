import {
  ClipboardGetText,
  ClipboardSetText,
} from "../../../../wailsjs/runtime/runtime";

type ClipboardRuntimeWindow = Window & {
  runtime?: {
    ClipboardGetText?: () => Promise<string>;
    ClipboardSetText?: (text: string) => Promise<boolean>;
  };
};

export async function writeClipboardText(contents: string) {
  if (getWailsRuntime()?.ClipboardSetText) {
    const copied = await ClipboardSetText(contents);
    if (!copied) {
      throw new Error("Clipboard copy failed");
    }
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(contents);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = contents;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

export async function readClipboardText() {
  if (getWailsRuntime()?.ClipboardGetText) {
    return ClipboardGetText();
  }

  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }

  throw new Error("Clipboard read is unavailable");
}

function getWailsRuntime() {
  return (window as ClipboardRuntimeWindow).runtime;
}
