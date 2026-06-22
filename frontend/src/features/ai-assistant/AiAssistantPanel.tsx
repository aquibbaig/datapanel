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
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
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
  AIChatTurn,
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

type TokenUsage = AIGenerateResponse["tokenUsage"];

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
  openai: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"],
  anthropic: [
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-latest",
    "claude-3-opus-latest",
  ],
  custom: ["openai-compatible"],
};

const contextWindowByModel: Record<string, string> = {
  "gpt-5.5": "1M ctx",
  "gpt-5.4": "1M ctx",
  "gpt-5.4-mini": "400k ctx",
  "gpt-5.4-nano": "ctx varies",
  "claude-3-5-haiku-latest": "200k ctx",
  "claude-3-5-sonnet-latest": "200k ctx",
  "claude-3-opus-latest": "200k ctx",
  "openai-compatible": "ctx varies",
};

const contextUsageByModel: Record<string, number> = {
  "gpt-5.5": 0.18,
  "gpt-5.4": 0.2,
  "gpt-5.4-mini": 0.24,
  "gpt-5.4-nano": 0.32,
  "claude-3-5-haiku-latest": 0.24,
  "claude-3-5-sonnet-latest": 0.24,
  "claude-3-opus-latest": 0.24,
  "openai-compatible": 0.42,
};

function defaultModelForProvider(provider: ProviderId) {
  return modelsByProvider[provider][0];
}

function normalizeModelForProvider(provider: ProviderId, model: string) {
  return modelsByProvider[provider].includes(model)
    ? model
    : defaultModelForProvider(provider);
}

const chatSQLHighlighter = createHighlighterCore({
  langs: [import("@shikijs/langs/sql")],
  themes: [
    import("@shikijs/themes/github-dark-high-contrast"),
    import("@shikijs/themes/github-light"),
  ],
  engine: createOnigurumaEngine(import("shiki/wasm")),
});

interface HighlightedSQLToken {
  color?: string;
  content: string;
  fontStyle?: number;
}

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
    defaultModelForProvider("openai"),
  );

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
            : "DataPanel received the app callback without storing credentials.",
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
    setSelectedModel(normalizeModelForProvider(provider, activeThread.model));
  }, [activeThread?.id]);

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
        description: errorMessage(error),
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
          model: defaultModelForProvider(provider),
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
        description: errorMessage(error),
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
        description: errorMessage(error),
      });
    }
  }

  async function createChatThread() {
    const provider = connectedProviders.some(
      (providerOption) => providerOption.id === selected.id,
    )
      ? selected.id
      : connectedProviders[0]?.id || "openai";
    const model = normalizeModelForProvider(provider, selectedModel);

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
        description: errorMessage(error),
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
        description: errorMessage(error),
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
        description: errorMessage(error),
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
          model: defaultModelForProvider(provider),
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
        description: errorMessage(error),
      });
    }
  }

  function openProvider(provider: ProviderLogin) {
    setSelectedProvider(provider.id);
    setPendingProvider(provider.id);
    openExternalUrl(provider.authUrl);
    toast("Browser opened", {
      description: `Finish ${provider.name} sign-in, then return to DataPanel.`,
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
        description: "DataPanel stores it locally in your Mac Keychain.",
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
        description: errorMessage(error),
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
        description: errorMessage(error),
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  async function askAI() {
    const prompt = chatPrompt.trim();
    if (!prompt || !chatReady) return;
    const requestModel = normalizeModelForProvider(selected.id, selectedModel);
    if (requestModel !== selectedModel) {
      setSelectedModel(requestModel);
    }
    let thread = activeThread;
    if (!thread) {
      thread = await appDataService.createThread({
        connectionId: connectionScopeId,
        title: "New chat",
        provider: selected.id,
        model: requestModel,
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
    const conversation = buildConversationHistory(chatMessages);
    setChatMessages((current) => [...current, userMessage]);
    setChatPrompt("");
    setChatBusy(true);
    try {
      await appDataService.saveMessage({
        id: userMessage.id,
        threadId: thread.id,
        connectionId: connectionScopeId,
        provider: selected.id,
        model: requestModel,
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
      if (!activeProfile) {
        const response = clarificationResponse(
          "Connect to a database before asking for schema-aware SQL.",
        );
        await saveAssistantResponse(thread.id, response);
        return;
      }
      const tableSelectionPrompt = buildTableSelectionPrompt(prompt, conversation);
      const deterministicTables = resolveTablesFromPrompt(
        tableSelectionPrompt,
        schemaSnapshot.schemas,
        schemaSnapshot.tablesBySchema,
      );
      const tablePlan =
        deterministicTables.length > 0
          ? {
              assumptions: [
                "Matched table names directly from the user request before planning.",
              ],
              needsClarification: false,
              question: "",
              tables: deterministicTables.map((table) => ({
                schema: table.schema,
                name: table.name,
                confidence: 1,
                reason: "The request references this table name.",
              })),
              tokenUsage: zeroTokenUsage(),
            }
          : await aiCredentialService.plan({
              provider: selected.id,
              model: requestModel,
              prompt,
              dialect: activeProfile.driver,
              conversation,
              tableContext: buildTablePlanningContext(
                activeProfile,
                schemaSnapshot.schemas,
                schemaSnapshot.tablesBySchema,
              ),
            });
      if (tablePlan.needsClarification || tablePlan.tables.length === 0) {
        const response = clarificationResponse(
          tablePlan.question || "Which table should I use for this request?",
          tablePlan.assumptions,
          tablePlan.tokenUsage,
        );
        await saveAssistantResponse(thread.id, response);
        return;
      }
      const schemaContext = (
        await schemaService.context({
          connectionId: activeProfile.id,
          prompt,
          dialect: activeProfile.driver,
          maxDetailedTables: Math.max(tablePlan.tables.length, 1),
          tables: tablePlan.tables.map((table) => ({
            schema: table.schema,
            name: table.name,
          })),
        })
      ).context;
      const response = await aiCredentialService.generate({
        provider: selected.id,
        model: requestModel,
        prompt,
        dialect: activeProfile?.driver || "postgres",
        responseStyle: settings?.chatResponsePrompt || "",
        schemaContext,
        conversation,
      });
      response.tokenUsage = addTokenUsage(
        tablePlan.tokenUsage,
        response.tokenUsage,
      );
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
        model: requestModel,
        role: assistantMessage.role,
        content: assistantMessage.content,
        response,
        createdAt: assistantMessage.createdAt,
      });
      applyThreadTokenUsage(thread.id, response.tokenUsage, assistantMessage.createdAt);
      if (response.sql) onLoadSQL(response.sql);
    } catch (error) {
      toast("AI request failed", {
        description: errorMessage(error),
      });
    } finally {
      setChatBusy(false);
    }
  }

  async function saveAssistantResponse(
    threadId: string,
    response: AIGenerateResponse,
  ) {
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
      threadId,
      connectionId: connectionScopeId,
      provider: selected.id,
      model: normalizeModelForProvider(selected.id, selectedModel),
      role: assistantMessage.role,
      content: assistantMessage.content,
      response,
      createdAt: assistantMessage.createdAt,
    });
    applyThreadTokenUsage(threadId, response.tokenUsage, assistantMessage.createdAt);
  }

  function applyThreadTokenUsage(
    threadId: string,
    usage: TokenUsage,
    updatedAt?: string,
  ) {
    if (!hasTokenUsage(usage) && !updatedAt) return;
    setChatThreads((current) =>
      current.map((thread) => {
        if (thread.id !== threadId) return thread;
        const nextUsage = addTokenUsage(thread.tokenUsage, usage);
        return {
          ...thread,
          promptTokens: nextUsage.promptTokens,
          completionTokens: nextUsage.completionTokens,
          totalTokens: nextUsage.totalTokens,
          tokenUsage: nextUsage,
          updatedAt: updatedAt || thread.updatedAt,
        };
      }),
    );
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
                  placeholder="Ask DataPanel to write, fix, or explain SQL..."
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
                            defaultModelForProvider(
                              event.target.value as ProviderId,
                            ),
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
            Paste the provider token after login. DataPanel stores it locally in
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
                ? "bg-selection text-selection-foreground"
                : "text-zinc-500 hover:bg-selection-hover hover:text-zinc-200",
            )}
            key={thread.id}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-3 pr-1 text-left"
              title={threadTitleTooltip(thread)}
              type="button"
              onClick={() => onSelectThread(thread.id)}
              onDoubleClick={() => onRenameStart(thread)}
            >
              <span className="min-w-0 truncate">{thread.title}</span>
              {thread.totalTokens > 0 ? (
                <span className="shrink-0 text-[10px] font-medium text-zinc-500">
                  {formatTokenCount(thread.totalTokens)}
                </span>
              ) : null}
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
            label="DataPanel return URL"
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
        <div className="grid min-w-0 gap-3 text-zinc-200">
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
            <SQLCodeBlock onCopySQL={onCopySQL} sql={response.sql} />
          ) : null}
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1 pl-1">
          <ChatActionButton label="Copy response" onClick={onCopyAnswer}>
            <Copy size={14} />
          </ChatActionButton>
          {response.sql ? (
            <>
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

function SQLCodeBlock({
  onCopySQL,
  sql,
}: {
  onCopySQL(): void;
  sql: string;
}) {
  const shikiTheme = currentShikiTheme();
  const [highlightedLines, setHighlightedLines] = useState<
    HighlightedSQLToken[][]
  >([]);

  useEffect(() => {
    let active = true;

    void chatSQLHighlighter
      .then((highlighter) => {
        const highlighted = highlighter.codeToTokens(sql, {
          lang: "sql",
          theme: shikiTheme,
        });
        if (!active) return;
        setHighlightedLines(
          highlighted.tokens.map((line) =>
            line.map((token) => ({
              color: token.color,
              content: token.content,
              fontStyle: token.fontStyle,
            })),
          ),
        );
      })
      .catch(() => {
        if (active) setHighlightedLines([[{ content: sql }]]);
      });

    return () => {
      active = false;
    };
  }, [shikiTheme, sql]);

  return (
    <div className="relative max-w-full overflow-hidden rounded-ui border border-line bg-surface-900/80">
      <button
        aria-label="Copy SQL"
        className="absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-md bg-surface-850/95 text-zinc-400 shadow-sm transition hover:bg-surface-800 hover:text-zinc-100"
        onClick={onCopySQL}
        title="Copy SQL"
        type="button"
      >
        <Copy size={13} />
      </button>
      <pre className="max-h-56 max-w-full overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words p-3 pr-10 font-mono text-[11px] leading-5 text-zinc-200 [overflow-wrap:anywhere]">
        <code>
          {highlightedLines.length > 0
            ? highlightedLines.map((line, lineIndex) => (
                <span key={lineIndex}>
                  {line.map((token, tokenIndex) => (
                    <span key={tokenIndex} style={shikiTokenStyle(token)}>
                      {token.content}
                    </span>
                  ))}
                  {lineIndex < highlightedLines.length - 1 ? "\n" : null}
                </span>
              ))
            : sql}
        </code>
      </pre>
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
      aria-label={label}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary"
          ? "bg-transparent text-accent hover:text-accent-hover"
          : "bg-transparent text-zinc-400 hover:text-zinc-100",
        !onClick &&
          "cursor-default bg-transparent text-zinc-400 hover:bg-transparent hover:text-zinc-400",
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
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

function zeroTokenUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function normalizeTokenUsage(usage?: TokenUsage | null): TokenUsage {
  const promptTokens = Math.max(0, usage?.promptTokens || 0);
  const completionTokens = Math.max(0, usage?.completionTokens || 0);
  const totalTokens = Math.max(
    0,
    usage?.totalTokens || promptTokens + completionTokens,
  );
  return { promptTokens, completionTokens, totalTokens };
}

function addTokenUsage(
  left?: TokenUsage | null,
  right?: TokenUsage | null,
): TokenUsage {
  const normalizedLeft = normalizeTokenUsage(left);
  const normalizedRight = normalizeTokenUsage(right);
  return {
    promptTokens:
      normalizedLeft.promptTokens + normalizedRight.promptTokens,
    completionTokens:
      normalizedLeft.completionTokens + normalizedRight.completionTokens,
    totalTokens: normalizedLeft.totalTokens + normalizedRight.totalTokens,
  };
}

function hasTokenUsage(usage?: TokenUsage | null) {
  return normalizeTokenUsage(usage).totalTokens > 0;
}

function formatTokenCount(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}m`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(Math.max(0, tokens));
}

function threadTitleTooltip(thread: AIChatThread) {
  if (thread.totalTokens <= 0) return "Double-click to rename";
  return `Double-click to rename. Tokens used: ${thread.totalTokens} total (${thread.promptTokens} prompt, ${thread.completionTokens} completion).`;
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

function currentShikiTheme() {
  if (typeof document === "undefined") return "github-dark-high-contrast";
  return document.documentElement.dataset.theme === "light"
    ? "github-light"
    : "github-dark-high-contrast";
}

function shikiTokenStyle(token: HighlightedSQLToken): CSSProperties {
  const fontStyle = token.fontStyle ?? 0;
  return {
    color: token.color,
    fontStyle: fontStyle & 1 ? "italic" : undefined,
    fontWeight: fontStyle & 2 ? 700 : undefined,
    textDecoration: fontStyle & 4 ? "underline" : undefined,
  };
}

function buildConversationHistory(messages: ChatMessage[]) {
  return messages
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: conversationContent(message),
    }))
    .filter((message) => message.content.trim().length > 0);
}

function conversationContent(message: ChatMessage) {
  if (!message.response) return message.content;

  const parts = [message.response.answer || message.content];
  if (message.response.sql) {
    parts.push(`SQL:\n${message.response.sql}`);
  }
  if (message.response.assumptions?.length) {
    parts.push(`Assumptions:\n${message.response.assumptions.join("\n")}`);
  }
  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

function buildTableSelectionPrompt(prompt: string, conversation: AIChatTurn[]) {
  const recentContext = conversation
    .slice(-6)
    .map((turn) => turn.content)
    .filter((content) => content.trim().length > 0)
    .join("\n\n");
  return [recentContext, prompt].filter((part) => part.trim().length > 0).join("\n\n");
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

function buildTablePlanningContext(
  activeProfile: ConnectionProfile,
  schemas: SchemaSummary[],
  tablesBySchema: Record<string, TableSummary[]>,
) {
  const lines = [
    `Connection: ${activeProfile.name}`,
    `Dialect: ${activeProfile.driver}`,
    `Database: ${activeProfile.database}`,
    "",
    "Tables:",
  ];

  for (const schema of schemas) {
    for (const table of tablesBySchema[schema.name] || []) {
      lines.push(
        `- ${table.schema}.${table.name} (${table.type}, estimated rows: ${table.rowEstimate})`,
      );
    }
  }

  if (lines.length === 5) {
    lines.push("- No tables loaded.");
  }

  return lines.join("\n");
}

function resolveTablesFromPrompt(
  prompt: string,
  schemas: SchemaSummary[],
  tablesBySchema: Record<string, TableSummary[]>,
) {
  const allTables = schemas.flatMap((schema) => tablesBySchema[schema.name] || []);
  const exactMatches = allTables.filter((table) =>
    promptReferencesTableName(prompt, table, "exact"),
  );
  if (exactMatches.length > 0) return uniqueTables(exactMatches);

  const componentMatches = allTables.filter((table) =>
    promptReferencesTableName(prompt, table, "components"),
  );
  return uniqueTables(componentMatches);
}

function promptReferencesTableName(
  prompt: string,
  table: TableSummary,
  mode: "exact" | "components",
) {
  const normalizedPrompt = normalizeIdentifierText(prompt);
  if (!normalizedPrompt) return false;

  const promptTokens = new Set(normalizedPrompt.split(/\s+/).filter(Boolean));
  const schema = table.schema.toLowerCase();
  const name = table.name.toLowerCase();
  const spacedName = name.split("_").filter(Boolean).join(" ");

  if (normalizedPrompt.includes(`${schema} ${name}`)) return true;
  if (normalizedPrompt.includes(`${schema} ${spacedName}`)) return true;
  if (promptTokens.has(name)) return true;
  if (normalizedPrompt.includes(spacedName)) return true;
  if (mode === "exact") return false;

  const nameParts = name.split("_").filter(Boolean);
  return nameParts.length > 1 && nameParts.every((part) => promptTokens.has(part));
}

function normalizeIdentifierText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTables(tables: TableSummary[]) {
  const seen = new Set<string>();
  const unique: TableSummary[] = [];
  for (const table of tables) {
    const key = `${table.schema}.${table.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(table);
  }
  return unique;
}

function errorMessage(error: unknown, fallback = "Unknown error") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const shaped = error as { message?: unknown; error?: unknown };
    if (typeof shaped.message === "string" && shaped.message.trim()) {
      return shaped.message;
    }
    if (typeof shaped.error === "string" && shaped.error.trim()) {
      return shaped.error;
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function clarificationResponse(
  answer: string,
  assumptions: string[] = [],
  tokenUsage: TokenUsage = zeroTokenUsage(),
): AIGenerateResponse {
  return {
    answer,
    sql: "",
    destructiveRisk: false,
    assumptions,
    tokenUsage: normalizeTokenUsage(tokenUsage),
  };
}
