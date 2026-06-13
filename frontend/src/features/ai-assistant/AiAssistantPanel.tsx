import {
  ArrowBigDownDash,
  ArrowUp,
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
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { aiCredentialService, appDataService, schemaService } from "../../lib/backend";
import { cn } from "../../lib/cn";
import type {
  AIChatThread,
  AICredentialStatus,
  AIGenerateResponse,
  AppSettings,
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
  settings: AppSettings | null;
  onExecuteSQL(sql: string): Promise<unknown>;
  onEnsureSchemaFresh?(): Promise<SchemaSnapshot>;
  onLoadSQL(sql: string): void;
}

interface SchemaSnapshot {
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
  fingerprint?: string;
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
  createdAt?: string;
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

const modelsByProvider: Record<ProviderId, string[]> = {
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
  anthropic: [
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-latest",
    "claude-3-opus-latest",
  ],
  custom: ["openai-compatible"],
};

const contextWindowByModel: Record<string, string> = {
  "gpt-4.1-mini": "1M ctx",
  "gpt-4.1": "1M ctx",
  "gpt-4o-mini": "128k ctx",
  "claude-3-5-haiku-latest": "200k ctx",
  "claude-3-5-sonnet-latest": "200k ctx",
  "claude-3-opus-latest": "200k ctx",
  "openai-compatible": "ctx varies",
};

const contextUsageByModel: Record<string, number> = {
  "gpt-4.1-mini": 0.18,
  "gpt-4.1": 0.18,
  "gpt-4o-mini": 0.34,
  "claude-3-5-haiku-latest": 0.24,
  "claude-3-5-sonnet-latest": 0.24,
  "claude-3-opus-latest": 0.24,
  "openai-compatible": 0.42,
};

export function AiAssistantPanel({
  activeProfile,
  schemas,
  settings,
  tablesBySchema,
  tableDetails,
  onExecuteSQL,
  onEnsureSchemaFresh,
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
  const [chatThreads, setChatThreads] = useState<AIChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [threadTitleDraft, setThreadTitleDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    modelsByProvider.openai[0],
  );
  const schemaDetailsCacheRef = useRef(new Map<string, Promise<TableDetails>>());
  const schemaFingerprintRef = useRef("");

  const selected =
    providers.find((provider) => provider.id === selectedProvider) ??
    providers[0];
  const connectionScopeId = activeProfile?.id || "global";
  const activeThread = chatThreads.find(
    (thread) => thread.id === activeThreadId,
  );
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

  useEffect(() => {
    if (!chatReady) {
      setChatThreads([]);
      setActiveThreadId("");
      setChatMessages([]);
      return;
    }
    void loadChatThreads();
  }, [chatReady, connectionScopeId]);

  useEffect(() => {
    if (!activeThreadId) {
      setChatMessages([]);
      return;
    }
    void loadChatMessages(activeThreadId);
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThread) return;
    const provider = normalizeProviderId(activeThread.provider);
    setSelectedProvider(provider);
    setSelectedModel(activeThread.model || modelsByProvider[provider][0]);
  }, [activeThread?.id]);

  useEffect(() => {
    schemaDetailsCacheRef.current.clear();
  }, [activeProfile?.id, schemas, tablesBySchema]);

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

  async function loadChatThreads() {
    try {
      let threads = await appDataService.listThreads(connectionScopeId);
      if (threads.length === 0) {
        const provider = connectedProviders[0]?.id ?? selected.id;
        const thread = await appDataService.createThread({
          connectionId: connectionScopeId,
          title: "Chat",
          provider,
          model: modelsByProvider[provider][0],
        });
        threads = [thread];
      }
      setChatThreads(threads);
      setActiveThreadId((current) =>
        threads.some((thread) => thread.id === current)
          ? current
          : threads[0]?.id || "",
      );
    } catch (error) {
      toast("Could not load AI chats", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async function loadChatMessages(threadId: string) {
    try {
      const messages = await appDataService.listMessages(threadId);
      setChatMessages(
        messages.map((message) => ({
          id: message.id,
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
          response: message.response,
          createdAt: message.createdAt,
        })),
      );
    } catch (error) {
      toast("Could not load AI messages", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async function createChatThread() {
    const provider = connectedProviders.some(
      (providerOption) => providerOption.id === selected.id,
    )
      ? selected.id
      : connectedProviders[0]?.id || "openai";
    const model = modelsByProvider[provider].includes(selectedModel)
      ? selectedModel
      : modelsByProvider[provider][0];

    try {
      const thread = await appDataService.createThread({
        connectionId: connectionScopeId,
        title: "New chat",
        provider,
        model,
      });
      setChatThreads((current) => [thread, ...current]);
      setActiveThreadId(thread.id);
      setChatMessages([]);
    } catch (error) {
      toast("Could not create chat", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async function updateActiveThreadSettings(
    provider: ProviderId,
    model: string,
  ) {
    setSelectedProvider(provider);
    setSelectedModel(model);
    if (!activeThread) return;
    try {
      const updated = await appDataService.updateThread({
        id: activeThread.id,
        title: activeThread.title,
        provider,
        model,
      });
      setChatThreads((current) =>
        current.map((thread) => (thread.id === updated.id ? updated : thread)),
      );
    } catch (error) {
      toast("Could not update chat settings", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async function renameThread(thread: AIChatThread, title: string) {
    const normalized = title.trim() || "New chat";
    setRenamingThreadId(null);
    setThreadTitleDraft("");
    if (normalized === thread.title) return;
    try {
      const updated = await appDataService.updateThread({
        id: thread.id,
        title: normalized,
        provider: thread.provider,
        model: thread.model,
      });
      setChatThreads((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      toast("Could not rename chat", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async function deleteChatThread(thread: AIChatThread) {
    const deletedIndex = chatThreads.findIndex((item) => item.id === thread.id);
    try {
      await appDataService.deleteThread(thread.id);
      let remaining = chatThreads.filter((item) => item.id !== thread.id);
      let nextActiveThreadId = activeThreadId;

      if (remaining.length === 0) {
        const provider = connectedProviders[0]?.id ?? selected.id;
        const replacement = await appDataService.createThread({
          connectionId: connectionScopeId,
          title: "Side chat",
          provider,
          model: modelsByProvider[provider][0],
        });
        remaining = [replacement];
        nextActiveThreadId = replacement.id;
      } else if (thread.id === activeThreadId) {
        nextActiveThreadId =
          remaining[Math.min(Math.max(deletedIndex, 0), remaining.length - 1)]
            ?.id || remaining[0].id;
      }

      setChatThreads(remaining);
      setActiveThreadId(nextActiveThreadId);
      if (thread.id === activeThreadId) setChatMessages([]);
      toast("Chat deleted", { description: thread.title });
    } catch (error) {
      toast("Could not delete chat", {
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
    let thread = activeThread;
    if (!thread) {
      thread = await appDataService.createThread({
        connectionId: connectionScopeId,
        title: "New chat",
        provider: selected.id,
        model: selectedModel,
      });
      setChatThreads((current) => [thread as AIChatThread, ...current]);
      setActiveThreadId(thread.id);
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: prompt,
      createdAt: new Date().toISOString(),
    };
    setChatMessages((current) => [...current, userMessage]);
    setChatPrompt("");
    setChatBusy(true);
    try {
      await appDataService.saveMessage({
        id: userMessage.id,
        threadId: thread.id,
        connectionId: connectionScopeId,
        provider: selected.id,
        model: selectedModel,
        role: userMessage.role,
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      });
      if (thread.title === "New chat") {
        await renameThread(thread, prompt.slice(0, 48));
      }
      const schemaSnapshot = onEnsureSchemaFresh
        ? await onEnsureSchemaFresh()
        : { schemas, tablesBySchema };
      if (
        schemaSnapshot.fingerprint &&
        schemaSnapshot.fingerprint !== schemaFingerprintRef.current
      ) {
        clearDetailsCacheForConnection(
          schemaDetailsCacheRef.current,
          activeProfile?.id || "",
        );
        schemaFingerprintRef.current = schemaSnapshot.fingerprint;
      }
      const schemaContext = await buildSchemaContext({
        activeProfile,
        prompt,
        schemas: schemaSnapshot.schemas,
        tableDetails,
        tablesBySchema: schemaSnapshot.tablesBySchema,
        detailsCache: schemaDetailsCacheRef.current,
      });
      const response = await aiCredentialService.generate({
        provider: selected.id,
        model: selectedModel,
        prompt,
        dialect: activeProfile?.driver || "postgres",
        responseStyle: settings?.chatResponsePrompt || "",
        schemaContext,
      });
      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: response.answer,
        response,
        createdAt: new Date().toISOString(),
      };
      setChatMessages((current) => [...current, assistantMessage]);
      await appDataService.saveMessage({
        id: assistantMessage.id,
        threadId: thread.id,
        connectionId: connectionScopeId,
        provider: selected.id,
        model: selectedModel,
        role: assistantMessage.role,
        content: assistantMessage.content,
        response,
        createdAt: assistantMessage.createdAt,
      });
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
            <ChatThreadBar
              activeThreadId={activeThreadId}
              renamingThreadId={renamingThreadId}
              threadTitleDraft={threadTitleDraft}
              threads={chatThreads}
              onCreateThread={() => void createChatThread()}
              onDeleteThread={(thread) => void deleteChatThread(thread)}
              onRenameCommit={(thread, title) =>
                void renameThread(thread, title)
              }
              onRenameStart={(thread) => {
                setRenamingThreadId(thread.id);
                setThreadTitleDraft(thread.title);
              }}
              onSelectThread={setActiveThreadId}
              onTitleDraftChange={setThreadTitleDraft}
            />
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
                <PromptInputToolbar className="mt-3 gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-surface-700 hover:text-zinc-100"
                      title="Manage credentials"
                      onClick={() => setManageOpen(true)}
                      type="button"
                    >
                      <CogIcon size={14} />
                    </button>
                    <div className="relative min-w-0">
                      <select
                        className="h-8 max-w-[142px] min-w-0 appearance-none rounded-md border-transparent bg-transparent px-1 pr-5 text-xs font-medium text-zinc-300 shadow-none hover:bg-surface-700 focus:border-transparent focus:shadow-none"
                        value={selected.id}
                        onChange={(event) =>
                          void updateActiveThreadSettings(
                            event.target.value as ProviderId,
                            modelsByProvider[
                              event.target.value as ProviderId
                            ][0],
                          )
                        }
                        title="AI provider"
                      >
                        {connectedProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500"
                        size={13}
                      />
                    </div>
                  </div>
                  <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
                    <ContextWindowMeter
                      label={contextWindowByModel[selectedModel] || "ctx varies"}
                      usage={contextUsageByModel[selectedModel] ?? 0.42}
                    />
                    <div className="relative min-w-0">
                      <select
                        className="h-8 max-w-[156px] min-w-0 appearance-none rounded-md border-transparent bg-transparent px-1 pr-5 text-xs font-medium text-zinc-300 shadow-none hover:bg-surface-700 focus:border-transparent focus:shadow-none"
                        value={selectedModel}
                        onChange={(event) =>
                          void updateActiveThreadSettings(
                            selected.id,
                            event.target.value,
                          )
                        }
                        title="AI model"
                      >
                        {modelsByProvider[selected.id].map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500"
                        size={13}
                      />
                    </div>
                    <Button
                      className="h-9 w-9 rounded-full px-0"
                      disabled={chatBusy || !chatPrompt.trim()}
                      type="submit"
                      variant="primary"
                      title="Send"
                    >
                      {chatBusy ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <ArrowUp size={17} />
                      )}
                    </Button>
                  </div>
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

function ContextWindowMeter({
  label,
  usage,
}: {
  label: string;
  usage: number;
}) {
  const clamped = Math.max(0.04, Math.min(0.96, usage));
  const degrees = Math.round(clamped * 360);
  return (
    <div
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition hover:bg-surface-700"
      title={`${label} context window`}
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 rounded-full"
        style={{
          background: `conic-gradient(#8f97ff 0deg ${degrees}deg, #3a3a40 ${degrees}deg 360deg)`,
        }}
      />
    </div>
  );
}

function ChatThreadBar({
  activeThreadId,
  onCreateThread,
  onDeleteThread,
  onRenameCommit,
  onRenameStart,
  onSelectThread,
  onTitleDraftChange,
  renamingThreadId,
  threadTitleDraft,
  threads,
}: {
  activeThreadId: string;
  onCreateThread(): void;
  onDeleteThread(thread: AIChatThread): void;
  onRenameCommit(thread: AIChatThread, title: string): void;
  onRenameStart(thread: AIChatThread): void;
  onSelectThread(threadId: string): void;
  onTitleDraftChange(title: string): void;
  renamingThreadId: string | null;
  threadTitleDraft: string;
  threads: AIChatThread[];
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-3">
      {threads.map((thread) => {
        const active = thread.id === activeThreadId;
        const renaming = thread.id === renamingThreadId;
        return renaming ? (
          <input
            autoFocus
            className="h-8 w-40 shrink-0 rounded-full border-transparent bg-surface-800 px-3 text-sm font-medium text-zinc-100"
            key={thread.id}
            value={threadTitleDraft}
            onBlur={() => onRenameCommit(thread, threadTitleDraft)}
            onChange={(event) => onTitleDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                onTitleDraftChange(thread.title);
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <div
            className={cn(
              "group flex h-8 w-40 shrink-0 items-center rounded-full text-sm font-medium transition",
              active
                ? "bg-surface-700 text-zinc-100"
                : "text-zinc-500 hover:bg-surface-800 hover:text-zinc-200",
            )}
            key={thread.id}
          >
            <button
              className="min-w-0 flex-1 truncate py-1.5 pl-3 pr-1 text-left"
              title="Double-click to rename"
              type="button"
              onClick={() => onSelectThread(thread.id)}
              onDoubleClick={() => onRenameStart(thread)}
            >
              {thread.title}
            </button>
            <button
              className="mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-zinc-500 opacity-0 transition hover:bg-surface-700 hover:text-zinc-100 group-hover:opacity-100 focus:opacity-100"
              title="Delete chat"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteThread(thread);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
      <button
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-500 transition hover:bg-surface-800 hover:text-zinc-100"
        title="New chat"
        type="button"
        onClick={onCreateThread}
      >
        <Plus size={18} />
      </button>
    </div>
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

function normalizeProviderId(provider: string): ProviderId {
  if (provider === "anthropic" || provider === "custom") return provider;
  return "openai";
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

async function buildSchemaContext({
  activeProfile,
  detailsCache,
  prompt,
  schemas,
  tableDetails,
  tablesBySchema,
}: {
  activeProfile: ConnectionProfile | null;
  detailsCache: Map<string, Promise<TableDetails>>;
  prompt: string;
  schemas: SchemaSummary[];
  tableDetails: TableDetails | null;
  tablesBySchema: Record<string, TableSummary[]>;
}) {
  if (!activeProfile) return "No active connection.";

  const allTables = flattenTables(schemas, tablesBySchema);
  const detailedTables = await loadDetailedTables({
    activeProfile,
    allTables,
    detailsCache,
    prompt,
    tableDetails,
  });
  const detailsByKey = new Map(
    detailedTables.map((details) => [
      schemaTableKey(activeProfile.id, details.schema, details.name),
      details,
    ]),
  );

  const lines = [
    `Connection: ${activeProfile.name}`,
    `Dialect: ${activeProfile.driver}`,
    `Database: ${activeProfile.database}`,
    "",
    "Schema context rules:",
    "- Only generate SQL against tables that include a Columns block below.",
    "- Column lists below are authoritative. Every SELECT, WHERE, GROUP BY, ORDER BY, and JOIN column must appear in that table's Columns block.",
    "- If a needed table lacks a Columns block, return an empty sql string and explain that column metadata is not loaded for that table.",
    "- If a requested column, metric, or join key is not listed, return an empty sql string and state the missing schema item instead of guessing.",
    "- Prefer listed FOREIGN KEY constraints for joins.",
    "",
    "Schemas and tables:",
  ];

  for (const schema of schemas) {
    lines.push(`- ${schema.name}`);
    for (const table of tablesBySchema[schema.name] || []) {
      const details = detailsByKey.get(
        schemaTableKey(activeProfile.id, table.schema, table.name),
      );
      lines.push(
        `  - ${table.schema}.${table.name} (${table.type}, estimated rows: ${table.rowEstimate})`,
      );
      if (details) {
        appendTableDetails(lines, details, "    ");
      } else {
        lines.push("    Columns: not loaded. Do not generate SQL against this table.");
      }
    }
  }

  lines.push("");
  if (detailedTables.length > 0) {
    lines.push(
      `Detailed column metadata included for ${detailedTables.length} table(s).`,
    );
  } else {
    lines.push("No detailed column metadata was available.");
  }

  return lines.join("\n");
}

const maxDetailedTablesInSchemaContext = 120;

function flattenTables(
  schemas: SchemaSummary[],
  tablesBySchema: Record<string, TableSummary[]>,
) {
  return schemas.flatMap((schema) => tablesBySchema[schema.name] || []);
}

async function loadDetailedTables({
  activeProfile,
  allTables,
  detailsCache,
  prompt,
  tableDetails,
}: {
  activeProfile: ConnectionProfile;
  allTables: TableSummary[];
  detailsCache: Map<string, Promise<TableDetails>>;
  prompt: string;
  tableDetails: TableDetails | null;
}) {
  const selected = selectTablesForSchemaContext(prompt, allTables, tableDetails);
  const loadable = selected.slice(0, maxDetailedTablesInSchemaContext);
  const settled = await Promise.allSettled(
    loadable.map((table) =>
      loadTableDetails(activeProfile.id, table, detailsCache),
    ),
  );

  return settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

function selectTablesForSchemaContext(
  prompt: string,
  allTables: TableSummary[],
  tableDetails: TableDetails | null,
) {
  const selectedKeys = new Set<string>();
  const selected: TableSummary[] = [];

  function addTable(table: Pick<TableSummary, "schema" | "name">) {
    const key = `${table.schema}.${table.name}`.toLowerCase();
    if (selectedKeys.has(key)) return;
    const summary =
      allTables.find(
        (candidate) =>
          candidate.schema.toLowerCase() === table.schema.toLowerCase() &&
          candidate.name.toLowerCase() === table.name.toLowerCase(),
      ) ??
      ({
        schema: table.schema,
        name: table.name,
        type: "TABLE",
        rowEstimate: 0,
      } as TableSummary);
    selectedKeys.add(key);
    selected.push(summary);
  }

  if (tableDetails) {
    addTable({ schema: tableDetails.schema, name: tableDetails.name });
  }

  for (const table of allTables) {
    if (promptReferencesTable(prompt, table)) addTable(table);
  }

  if (allTables.length <= maxDetailedTablesInSchemaContext) {
    for (const table of allTables) addTable(table);
  }

  return selected;
}

function promptReferencesTable(prompt: string, table: TableSummary) {
  const normalizedPrompt = normalizeIdentifierText(prompt);
  const promptTokens = new Set(normalizedPrompt.split(/\s+/).filter(Boolean));
  const schema = table.schema.toLowerCase();
  const name = table.name.toLowerCase();
  const nameParts = name.split("_").filter(Boolean);

  if (normalizedPrompt.includes(`${schema} ${name}`)) return true;
  if (promptTokens.has(name)) return true;
  if (name.endsWith("s") && promptTokens.has(name.slice(0, -1))) return true;
  if (nameParts.length > 1 && nameParts.every((part) => promptTokens.has(part))) {
    return true;
  }
  return false;
}

function normalizeIdentifierText(value: string) {
  return value
    .toLowerCase()
    .replace(/["'`[\]().,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadTableDetails(
  connectionId: string,
  table: Pick<TableSummary, "schema" | "name">,
  detailsCache: Map<string, Promise<TableDetails>>,
) {
  const key = schemaTableKey(connectionId, table.schema, table.name);
  let existing = detailsCache.get(key);
  if (!existing) {
    existing = schemaService
      .describe(connectionId, table.schema, table.name)
      .catch((error) => {
        detailsCache.delete(key);
        throw error;
      });
    detailsCache.set(key, existing);
  }
  return existing;
}

function schemaTableKey(connectionId: string, schema: string, table: string) {
  return `${connectionId}:${schema}.${table}`.toLowerCase();
}

function clearDetailsCacheForConnection(
  detailsCache: Map<string, Promise<TableDetails>>,
  connectionId: string,
) {
  if (!connectionId) return;
  const prefix = `${connectionId}:`.toLowerCase();
  for (const key of detailsCache.keys()) {
    if (key.startsWith(prefix)) detailsCache.delete(key);
  }
}

function appendTableDetails(
  lines: string[],
  tableDetails: TableDetails,
  indent = "",
) {
  lines.push(`${indent}Columns:`);
  for (const column of tableDetails.columns) {
    lines.push(
      `${indent}- ${column.name}: ${column.dataType}${column.nullable ? ", nullable" : ", not null"}${column.isPrimary ? ", primary key" : ""}${column.default ? `, default ${column.default}` : ""}`,
    );
  }
  if (tableDetails.constraints.length > 0) {
    lines.push(`${indent}Constraints:`);
    for (const constraint of tableDetails.constraints) {
      lines.push(`${indent}- ${constraint.type}: ${constraint.definition}`);
    }
  }
}
