import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

interface Props {
  title: string;
  open: boolean;
  children: ReactNode;
  onClose(): void;
}

export function Modal({ title, open, children, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6">
      <div className="w-full max-w-[560px] rounded-xl border border-line bg-surface-850 shadow-2xl">
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          <Button size="icon" onClick={onClose} title="Close">
            <X size={14} />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
