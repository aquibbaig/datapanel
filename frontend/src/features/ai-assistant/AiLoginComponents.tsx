import { CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";

export type ProviderId = "openai" | "anthropic" | "custom";
export type ProviderStatus = "idle" | "connected" | "error";

export interface ProviderLogin {
  id: ProviderId;
  name: string;
  keyUrl: string;
  modelHint: string;
  description: string;
}

export function ProviderButton({
  active,
  provider,
  status,
  onClick,
  onConnect,
}: {
  active: boolean;
  provider: ProviderLogin;
  status: ProviderStatus;
  onClick(): void;
  onConnect(): void;
}) {
  const connected = status === "connected";

  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-ui border p-2 text-left transition",
        active
          ? "border-zinc-500 bg-surface-800"
          : "border-line bg-surface-850 hover:border-zinc-600",
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onClick}
        type="button"
      >
        <ProviderMark name={provider.name} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-zinc-100">
              {provider.name}
            </span>
            <span className="max-w-[88px] shrink truncate rounded border border-line bg-surface-900 px-1.5 py-0.5 text-[10px] uppercase text-muted">
              {provider.modelHint}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 break-words text-xs leading-4 text-muted">
            {provider.description}
          </p>
        </div>
      </button>
      {connected ? (
        <CheckCircle2 size={14} className="shrink-0 text-emerald-300" />
      ) : null}
      <Button
        aria-label={`Get ${provider.name} API key`}
        className="h-8 shrink-0 px-2.5 text-xs"
        title={`Get ${provider.name} API key`}
        onClick={(event) => {
          event.stopPropagation();
          onConnect();
        }}
      >
        <ExternalLink size={14} />
        Get key
      </Button>
    </div>
  );
}

export function ProviderMark({ name }: { name: string }) {
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-surface-900 text-[11px] font-semibold text-zinc-200">
      {name.slice(0, 2)}
    </div>
  );
}

export function StatusBadge({ status }: { status: "connected" | "error" }) {
  const labels = {
    connected: "Connected",
    error: "Callback failed",
  };

  return (
    <div
      className={cn(
        "flex max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]",
        status === "connected"
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
          : "border-red-400/30 bg-red-500/10 text-red-100",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          status === "connected" ? "bg-emerald-300" : "bg-red-300",
        )}
      />
      <span className="truncate">{labels[status]}</span>
    </div>
  );
}
