import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { captureTelemetryBoundaryError } from "../lib/telemetry";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    void captureTelemetryBoundaryError(error, errorInfo);
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <section className="grid w-full max-w-md gap-4 rounded-lg border border-line bg-surface-900 p-5 shadow-2xl">
          <div className="grid gap-1">
            <h1 className="text-lg font-semibold text-zinc-100">
              DataPanel needs to reload
            </h1>
            <p className="text-sm leading-5 text-muted">
              The app hit a rendering error. Reloading will restore the
              workspace.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={14} />
              Reload
            </Button>
          </div>
        </section>
      </main>
    );
  }
}
