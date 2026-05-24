import {
  ArrowBigDownDash,
  ChevronDown,
  Clipboard,
  CogIcon,
  Copy,
  Database,
  ExternalLink,
  FileQuestion,
  KeyRound,
  Loader2,
  MessageSquare,
  PlayCircle,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BrowserOpenURL, EventsOn } from "../../../wailsjs/runtime/runtime";
import {
  Conversation,
  ConversationContent,
  ConversationEmpty,
} from "../../components/ai-elements/conversation";
import { Message, MessageContent } from "../../components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
} from "../../components/ai-elements/prompt-input";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { aiCredentialService } from "../../lib/backend";
import { cn } from "../../lib/cn";
import type {
  AICredentialStatus,
  AIGenerateResponse,
  ConnectionProfile,
  SchemaSummary,
  TableDetails,
  TableSummary,
} from "../../lib/types";
import {
  ProviderButton,
  StatusBadge,
  type ProviderId,
  type ProviderLogin,
} from "./AiLoginComponents";

interface Props {
  activeProfile: ConnectionProfile | null;
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
  tableDetails: TableDetails | null;
  onExecuteSQL(sql: string): Promise<unknown>;
  onLoadSQL(sql: string): void;
}

interface AICallbackEvent {
  provider: ProviderId | "unknown";
  status: "received" | "connected" | "error" | "manual";
  hasCode: boolean;
  hasState: boolean;
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  response?: AIGenerateResponse;
}

type RuntimeBridge = {
  BrowserOpenURL?: (url: string) => void;
  EventsOn?: (
    eventName: string,
    callback: (...data: unknown[]) => void,
  ) => () => void;
};

type WailsWindow = Window & {
  runtime?: RuntimeBridge;
};

const providers: ProviderLogin[] = [
  {
    id: "openai",
    name: "OpenAI",
    authUrl: "https://platform.openai.com/login",
    modelHint: "GPT models",
    description: "Connect OpenAI for schema-aware SQL chat and actions.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    authUrl: "https://console.anthropic.com/login",
    modelHint: "Claude models",
    description: "Connect Anthropic for query drafting and execution review.",
  },
  {
    id: "custom",
    name: "OpenAI-compatible",
    authUrl: "https://ai-sdk.dev/providers/openai-compatible-providers",
    modelHint: "Compatible endpoint",
    description: "Use a secure backend connector for self-hosted models.",
  },
];

export function AiAssistantPanel({
  activeProfile,
  schemas,
  tablesBySchema,
  tableDetails,
  onExecuteSQL,
  onLoadSQL,
}: Props) {
  const [selectedProvider, setSelectedProvider] =
    useState<ProviderId>("openai");
  const [pendingProvider, setPendingProvider] = useState<ProviderId | null>(
    null,
  );
  const [callback, setCallback] = useState<AICallbackEvent | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [credentialStatuses, setCredentialStatuses] = useState<
    Partial<Record<ProviderId, AICredentialStatus>>
  >({});
  const [credentialToken, setCredentialToken] = useState("");
  const [credentialLabel, setCredentialLabel] = useState("");
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);

  const selected =
    providers.find((provider) => provider.id === selectedProvider) ??
    providers[0];
  const selectedCredential = credentialStatuses[selected.id];
  const connectedProviders = providers.filter(
    (provider) => credentialStatuses[provider.id]?.connected,
  );
  const chatReady = connectedProviders.length > 0;
  const returnUrl = buildReturnUrl(selected.id);
  const schemaSummary = useMemo(
    () => summarizeSchema(activeProfile, schemas, tablesBySchema, tableDetails),
    [activeProfile, schemas, tableDetails, tablesBySchema],
  );
  const featureCards = useMemo(
    () => [
      {
        icon: <ShieldCheck size={14} />,
        title: "Credential Safety",
        description:
          "Provider keys, access tokens, auth codes, prompts, and schema payloads stay out of frontend storage.",
      },
      {
        icon: <Database size={14} />,
        title: "Schema Context",
        description: `${schemaSummary.tables} ${schemaSummary.selectedTable}`,
      },
      {
        icon: <MessageSquare size={14} />,
        title: "AI Chat",
        description:
          "After login, the panel becomes a schema-aware SQL chat surface.",
      },
      {
        icon: <Clipboard size={14} />,
        title: "Copy Queries",
        description:
          "Generated SQL can be copied or loaded directly into the editor.",
      },
      {
        icon: <PlayCircle size={14} />,
        title: "Approved Execute",
        description:
          "Data-changing SQL stays behind review and explicit approval.",
      },
      {
        icon: <FileQuestion size={14} />,
        title: "Explain Plans",
        description:
          "Ask why a query is slow and inspect database-specific plans.",
      },
    ],
    [schemaSummary],
  );

  useEffect(() => {
    if (!getWailsRuntime()?.EventsOn) return undefined;

    return EventsOn("datapanel:ai-callback", (event: AICallbackEvent) => {
      setCallback(event);
      setPendingProvider(null);
      toast("Provider callback received", {
        description:
          event.status === "error"
            ? "The provider returned an error. No sensitive values were stored."
            : "Datapanel received the app callback without storing credentials.",
      });
    });
  }, []);

  useEffect(() => {
    void loadCredentialStatuses();
  }, []);

  useEffect(() => {
    if (credentialStatuses[selectedProvider]?.connected) return;
    const firstConnected = providers.find(
      (provider) => credentialStatuses[provider.id]?.connected,
    );
    if (firstConnected) setSelectedProvider(firstConnected.id);
  }, [credentialStatuses, selectedProvider]);

  async function loadCredentialStatuses() {
    try {
      const statuses = await aiCredentialService.list();
      setCredentialStatuses(
        Object.fromEntries(
          statuses.map((status) => [status.provider, status]),
        ) as Partial<Record<ProviderId, AICredentialStatus>>,
      );
    } catch (error) {
      toast("Could not load AI credentials", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  function openProvider(provider: ProviderLogin) {
    setSelectedProvider(provider.id);
    setPendingProvider(provider.id);
    openExternalUrl(provider.authUrl);
    toast("Browser opened", {
      description: `Finish ${provider.name} sign-in, then return to Datapanel.`,
    });
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copied", { description: label });
    } catch {
      toast("Copy failed", {
        description: "Select the URL and copy it manually.",
      });
    }
  }

  async function saveCredential() {
    const token = credentialToken.trim();
    if (!token) {
      toast("Paste a provider token", {
        description: "Datapanel stores it locally in your Mac Keychain.",
      });
      return;
    }

    setCredentialBusy(true);
    try {
      const status = await aiCredentialService.save({
        provider: selected.id,
        token,
        label: credentialLabel.trim(),
      });
      setCredentialStatuses((current) => ({
        ...current,
        [selected.id]: status,
      }));
      setCredentialToken("");
      setCredentialLabel("");
      setManageOpen(false);
      toast("AI credential stored", {
        description: `${selected.name} token saved to ${status.storage}.`,
      });
    } catch (error) {
      toast("Could not store AI credential", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  async function deleteCredential() {
    setCredentialBusy(true);
    try {
      await aiCredentialService.remove(selected.id);
      setCredentialStatuses((current) => ({
        ...current,
        [selected.id]: {
          provider: selected.id,
          connected: false,
          keyHint: "",
          label: "",
          updatedAt: "",
          storage: selectedCredential?.storage || "keychain",
        } as AICredentialStatus,
      }));
      toast("AI credential removed", {
        description: `${selected.name} token deleted from the credential store.`,
      });
    } catch (error) {
      toast("Could not remove AI credential", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  async function askAI() {
    const prompt = chatPrompt.trim();
    if (!prompt || !chatReady) return;

    setChatMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: prompt },
    ]);
    setChatPrompt("");
    setChatBusy(true);
    try {
      const response = await aiCredentialService.generate({
        provider: selected.id,
        prompt,
        dialect: activeProfile?.driver || "postgres",
        schemaContext: buildSchemaContext(
          activeProfile,
          schemas,
          tablesBySchema,
          tableDetails,
        ),
      });
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.answer,
          response,
        },
      ]);
      if (response.sql) onLoadSQL(response.sql);
    } catch (error) {
      toast("AI request failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setChatBusy(false);
    }
  }

  async function executeGeneratedSQL(sql: string) {
    setChatBusy(true);
    try {
      await onExecuteSQL(sql);
    } finally {
      setChatBusy(false);
    }
  }

  const selectedStatus = getProviderStatus(
    selected.id,
    pendingProvider,
    callback,
    credentialStatuses,
  );

  return (
    <>
      <div
        className={cn(
          "flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden",
          chatReady ? "overflow-hidden" : "gap-3 overflow-y-auto pr-1",
        )}
      >
        {chatReady ? (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-900">
            <Conversation>
              <ConversationContent className="px-4 pb-3 pt-4">
                {chatMessages.length === 0 ? (
                  <ConversationEmpty className="min-h-[260px] text-xs text-muted mt-32">
                    <div className="flex max-w-[300px] flex-col items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface-850">
                        <MessageSquare size={17} />
                      </div>
                      <p>
                        Ask for SQL, schema help, query fixes, or an execution
                        plan.
                      </p>
                    </div>
                  </ConversationEmpty>
                ) : (
                  chatMessages.map((message) =>
                    message.response ? (
                      <AIResponseView
                        busy={chatBusy}
                        key={message.id}
                        response={message.response}
                        onCopyAnswer={() =>
                          void copyText("AI response copied.", message.content)
                        }
                        onCopySQL={() =>
                          void copyText(
                            "Generated SQL copied.",
                            message.response?.sql || "",
                          )
                        }
                        onExecuteSQL={() =>
                          void executeGeneratedSQL(message.response?.sql || "")
                        }
                        onLoadSQL={() => onLoadSQL(message.response?.sql || "")}
                      />
                    ) : (
                      <Message from={message.role} key={message.id}>
                        <MessageContent>{message.content}</MessageContent>
                      </Message>
                    ),
                  )
                )}
                {chatBusy ? <ThinkingMessage /> : null}
              </ConversationContent>
            </Conversation>

            <PromptInput
              className="px-4 pb-4 pt-1"
              onSubmit={(event) => {
                event.preventDefault();
                void askAI();
              }}
            >
              <div className="rounded-[22px] border border-line bg-surface-850 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <PromptInputTextarea
                  placeholder="Ask Datapanel to write, fix, or explain SQL..."
                  value={chatPrompt}
                  onChange={(event) => setChatPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                      void askAI();
                    }
                  }}
                />
                <PromptInputToolbar className="mt-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <select
                      className="h-8 max-w-[156px] min-w-0 rounded-full border border-line bg-surface-900 px-2 text-xs text-zinc-200"
                      value={selected.id}
                      onChange={(event) =>
                        setSelectedProvider(event.target.value as ProviderId)
                      }
                      title="AI provider"
                    >
                      {connectedProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="icon"
                      title="Manage credentials"
                      onClick={() => setManageOpen(true)}
                      type="button"
                      className="px-2"
                    >
                      <CogIcon size={14} />
                    </Button>
                  </div>
                  <Button
                    className="h-10 w-7 rounded-full px-0"
                    disabled={chatBusy || !chatPrompt.trim()}
                    type="submit"
                    variant="primary"
                    title="Send"
                  >
                    {chatBusy ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Send size={16} />
                    )}
                  </Button>
                </PromptInputToolbar>
              </div>
            </PromptInput>
          </section>
        ) : (
          <section className="min-w-0 rounded-ui border border-line bg-surface-900 p-3">
            {selectedStatus === "connected" || selectedStatus === "error" ? (
              <div className="mb-2 flex justify-end">
                <StatusBadge status={selectedStatus} />
              </div>
            ) : null}

            <div className="grid min-w-0 gap-1.5">
              {providers.map((provider) => (
                <ProviderButton
                  key={provider.id}
                  active={provider.id === selected.id}
                  provider={provider}
                  status={getProviderStatus(
                    provider.id,
                    pendingProvider,
                    callback,
                    credentialStatuses,
                  )}
                  onClick={() => setSelectedProvider(provider.id)}
                  onConnect={() => openProvider(provider)}
                />
              ))}
            </div>
            <Button className="mt-3 w-full" onClick={() => setManageOpen(true)}>
              <KeyRound size={14} />
              Manage credentials
            </Button>
          </section>
        )}

        {!chatReady ? (
          <ManualLoginSection
            manualOpen={manualOpen}
            returnUrl={returnUrl}
            selected={selected}
            onCopyText={copyText}
            onOpenProvider={openProvider}
            onToggle={() => setManualOpen((current) => !current)}
          />
        ) : null}

        {!chatReady ? (
          <section className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
            {featureCards.map((feature) => (
              <FeatureCard
                key={feature.title}
                description={feature.description}
                icon={feature.icon}
                title={feature.title}
              />
            ))}
          </section>
        ) : null}
      </div>
      <Modal
        open={manageOpen}
        title="Manage credentials"
        onClose={() => setManageOpen(false)}
      >
        <div className="grid min-w-0 gap-3">
          <p className="text-sm leading-6 text-muted">
            Paste the provider token after login. Datapanel stores it locally in
            your Mac Keychain and never shows the full value again.
          </p>

          {selectedCredential?.connected ? (
            <div className="rounded-ui border border-line bg-surface-900 p-2 text-xs text-muted">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {selectedCredential.label || `${selected.name} credential`}
                </span>
                <span className="shrink-0 text-zinc-400">
                  {selectedCredential.keyHint} /{" "}
                  {formatCredentialDate(selectedCredential.updatedAt)}
                </span>
              </div>
            </div>
          ) : null}

          <input
            autoComplete="off"
            className="min-w-0 rounded-ui border-line bg-surface-900 px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600"
            placeholder="Optional label, e.g. Work project"
            value={credentialLabel}
            onChange={(event) => setCredentialLabel(event.target.value)}
          />
          <input
            autoComplete="off"
            className="min-w-0 rounded-ui border-line bg-surface-900 px-2 py-1.5 font-mono text-sm text-zinc-200 placeholder:text-zinc-600"
            placeholder={`Paste ${selected.name} token`}
            type="password"
            value={credentialToken}
            onChange={(event) => setCredentialToken(event.target.value)}
          />
          <div className="flex min-w-0 gap-2">
            <Button
              className="min-w-0 flex-1"
              disabled={credentialBusy}
              variant="primary"
              onClick={() => void saveCredential()}
            >
              {credentialBusy ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <KeyRound size={14} />
              )}
              Store in Keychain
            </Button>
            {selectedCredential?.connected ? (
              <Button
                disabled={credentialBusy}
                size="icon"
                title={`Remove ${selected.name} credential`}
                onClick={() => void deleteCredential()}
              >
                <Trash2 size={14} />
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
}

function ManualLoginSection({
  manualOpen,
  onCopyText,
  onOpenProvider,
  onToggle,
  returnUrl,
  selected,
}: {
  manualOpen: boolean;
  onCopyText(label: string, value: string): Promise<void>;
  onOpenProvider(provider: ProviderLogin): void;
  onToggle(): void;
  returnUrl: string;
  selected: ProviderLogin;
}) {
  return (
    <section className="min-w-0 rounded-ui border border-line bg-surface-900 p-3">
      <button
        aria-expanded={manualOpen}
        className="flex w-full min-w-0 items-center justify-between gap-3 text-left"
        onClick={onToggle}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase text-zinc-400">
          <ExternalLink size={12} />
          Manual Login URLs
        </span>
        <ChevronDown
          className={cn("text-zinc-500 transition", manualOpen && "rotate-180")}
          size={14}
        />
      </button>
      {manualOpen ? (
        <div className="mt-3 grid min-w-0 gap-2">
          <p className="text-xs leading-5 text-muted">
            Use these when the packaged app cannot open your browser or when you
            are configuring an OAuth app by hand.
          </p>
          <UrlRow
            label={`${selected.name} login URL`}
            help="Copy this into your browser if the connect button does not open."
            value={selected.authUrl}
            onCopy={() =>
              void onCopyText("Provider login URL copied.", selected.authUrl)
            }
            onOpen={() => onOpenProvider(selected)}
          />
          <UrlRow
            label="Datapanel return URL"
            help="Copy this into the provider's allowed callback or redirect URLs."
            value={returnUrl}
            onCopy={() => void onCopyText("Return URL copied.", returnUrl)}
          />
        </div>
      ) : null}
    </section>
  );
}

function FeatureCard({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="min-h-[112px] min-w-0 overflow-hidden rounded-ui border border-line bg-surface-900 p-3">
      <div className="mb-2 flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase text-zinc-300">
        <span className="shrink-0 text-zinc-400">{icon}</span>
        <span className="min-w-0 truncate">{title}</span>
      </div>
      <p className="break-words text-xs leading-5 text-muted">{description}</p>
    </div>
  );
}

function ThinkingMessage() {
  return (
    <div aria-label="Thinking" className="flex min-w-0 justify-start py-1">
      <span className="datapanel-chat-cursor ml-1 h-5 w-[3px] rounded-full bg-zinc-200" />
    </div>
  );
}

function AIResponseView({
  busy,
  onCopyAnswer,
  onCopySQL,
  onExecuteSQL,
  onLoadSQL,
  response,
}: {
  busy: boolean;
  onCopyAnswer(): void;
  onCopySQL(): void;
  onExecuteSQL(): void;
  onLoadSQL(): void;
  response: AIGenerateResponse;
}) {
  return (
    <div className="flex min-w-0 justify-start">
      <div className="min-w-0 max-w-[98%]">
        <div className="grid min-w-0 gap-3 rounded-[18px] bg-black/15 px-1 py-2 text-zinc-200">
          {response.destructiveRisk ? (
            <div className="rounded-ui border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs leading-5 text-yellow-100">
              Review carefully. The model marked this SQL as data-changing or
              destructive.
            </div>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-zinc-100">
            {response.answer}
          </p>
          {response.assumptions?.length ? (
            <div className="border-t border-line/70 pt-3">
              <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-muted">
                {response.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {response.sql ? (
            <pre className="max-h-56 max-w-full overflow-auto rounded-ui border border-line bg-surface-900/80 p-3 font-mono text-[11px] leading-5 text-zinc-200">
              {response.sql}
            </pre>
          ) : null}
        </div>
        <div className="mt-2 grid max-w-[260px] gap-1.5 pl-1">
          <ChatActionButton label="Copy response" onClick={onCopyAnswer}>
            <Copy size={14} />
          </ChatActionButton>
          {response.sql ? (
            <>
              <ChatActionButton label="Copy SQL" onClick={onCopySQL}>
                <Clipboard size={14} />
              </ChatActionButton>
              <ChatActionButton
                label="Load query into editor"
                onClick={onLoadSQL}
              >
                <ArrowBigDownDash size={17} />
              </ChatActionButton>
              <ChatActionButton
                disabled={busy}
                label="Run query"
                onClick={onExecuteSQL}
                variant="primary"
              >
                <PlayCircle size={14} />
              </ChatActionButton>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChatActionButton({
  children,
  disabled,
  label,
  onClick,
  variant = "default",
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
  variant?: "default" | "primary";
}) {
  return (
    <button
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary"
          ? "bg-transparent text-[#8f97ff] hover:text-[#a8aeff]"
          : "bg-transparent text-zinc-400 hover:text-zinc-100",
        !onClick &&
          "cursor-default bg-transparent text-zinc-400 hover:bg-transparent hover:text-zinc-400",
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center",
          variant === "primary" ? "text-[#8f97ff]" : "text-zinc-400",
        )}
      >
        {children}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function UrlRow({
  label,
  help,
  value,
  onCopy,
  onOpen,
}: {
  label: string;
  help: string;
  value: string;
  onCopy(): void;
  onOpen?: () => void;
}) {
  return (
    <div className="grid gap-1">
      <label className="text-[11px] font-medium text-zinc-400">{label}</label>
      <p className="text-[11px] leading-4 text-muted">{help}</p>
      <div className="flex min-w-0 gap-1.5">
        <input
          className="min-w-0 flex-1 rounded-ui border-line bg-surface-850 px-2 py-1.5 font-mono text-[11px] text-zinc-300"
          readOnly
          value={value}
        />
        {onOpen ? (
          <Button
            aria-label="Open URL"
            size="icon"
            title="Open URL"
            onClick={onOpen}
          >
            <ExternalLink size={14} />
          </Button>
        ) : null}
        <Button
          aria-label="Copy URL"
          size="icon"
          title="Copy URL"
          onClick={onCopy}
        >
          <Copy size={14} />
        </Button>
      </div>
    </div>
  );
}

function getProviderStatus(
  provider: ProviderId,
  pendingProvider: ProviderId | null,
  callback: AICallbackEvent | null,
  credentials: Partial<Record<ProviderId, AICredentialStatus>>,
) {
  if (credentials[provider]?.connected) return "connected";
  if (callback?.provider === provider) {
    return callback.status === "error" ? "error" : "idle";
  }
  if (pendingProvider === provider) return "pending";
  return "idle";
}

function formatCredentialDate(value: string) {
  if (!value) return "stored";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildReturnUrl(provider: ProviderId) {
  return `datapanel://ai-callback?provider=${provider}&status=manual`;
}

function openExternalUrl(url: string) {
  if (getWailsRuntime()?.BrowserOpenURL) {
    BrowserOpenURL(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function getWailsRuntime() {
  return (window as WailsWindow).runtime;
}

function summarizeSchema(
  activeProfile: ConnectionProfile | null,
  schemas: SchemaSummary[],
  tablesBySchema: Record<string, TableSummary[]>,
  tableDetails: TableDetails | null,
) {
  if (!activeProfile) {
    return {
      connection: "No active database connection.",
      tables: "Connect to a database before generating SQL.",
      selectedTable: "No table selected.",
    };
  }

  const tableCount = schemas.reduce(
    (total, schema) => total + (tablesBySchema[schema.name]?.length ?? 0),
    0,
  );

  return {
    connection: `${activeProfile.driver} / ${activeProfile.database}`,
    tables: `${schemas.length} schema(s), ${tableCount} table(s) loaded.`,
    selectedTable: tableDetails
      ? `${tableDetails.schema}.${tableDetails.name} selected with ${tableDetails.columns.length} column(s).`
      : "No table selected.",
  };
}

function buildSchemaContext(
  activeProfile: ConnectionProfile | null,
  schemas: SchemaSummary[],
  tablesBySchema: Record<string, TableSummary[]>,
  tableDetails: TableDetails | null,
) {
  if (!activeProfile) return "No active connection.";

  const lines = [
    `Connection: ${activeProfile.name}`,
    `Dialect: ${activeProfile.driver}`,
    `Database: ${activeProfile.database}`,
    "",
    "Schemas and tables:",
  ];

  for (const schema of schemas) {
    lines.push(`- ${schema.name}`);
    for (const table of tablesBySchema[schema.name] || []) {
      lines.push(
        `  - ${table.schema}.${table.name} (${table.type}, estimated rows: ${table.rowEstimate})`,
      );
    }
  }

  if (tableDetails) {
    lines.push(
      "",
      `Selected table: ${tableDetails.schema}.${tableDetails.name}`,
    );
    for (const column of tableDetails.columns) {
      lines.push(
        `- ${column.name}: ${column.dataType}${column.nullable ? ", nullable" : ", not null"}${column.isPrimary ? ", primary key" : ""}${column.default ? `, default ${column.default}` : ""}`,
      );
    }
    if (tableDetails.constraints.length > 0) {
      lines.push("Constraints:");
      for (const constraint of tableDetails.constraints) {
        lines.push(`- ${constraint.type}: ${constraint.definition}`);
      }
    }
  }

  return lines.join("\n");
}
