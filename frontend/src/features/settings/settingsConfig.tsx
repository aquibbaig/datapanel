import {
  Database,
  Download,
  Eye,
  Keyboard,
  Monitor,
  Moon,
  MousePointer,
  Shield,
  Sun,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AppSettings } from "../../lib/types";

export type SectionId = "general" | "query" | "editor" | "exports" | "privacy";
type IconComponent = typeof Monitor;

type SegmentKey = "theme" | "cursorMode";
type BooleanKey =
  | "confirmDestructiveSql"
  | "vimNavigationEnabled"
  | "telemetryEnabled";
type NumberKey = "queryLimit" | "queryTimeoutSeconds";
type TextKey = "chatResponsePrompt" | "exportDirectory";

export type SettingsField =
  | {
      kind: "segment";
      key: SegmentKey;
      section: SectionId;
      title: string;
      description: string;
      options: readonly {
        value: AppSettings[SegmentKey];
        label: string;
        icon?: ReactNode;
      }[];
    }
  | {
      kind: "toggle";
      key: BooleanKey;
      section: SectionId;
      title: string;
      description: string;
    }
  | {
      kind: "number";
      key: NumberKey;
      section: SectionId;
      title: string;
      description: string;
    }
  | {
      kind: "textarea" | "text";
      key: TextKey;
      section: SectionId;
      title: string;
      description: string;
      placeholder?: string;
      resetValue?: string;
      resetTitle?: string;
      wide?: boolean;
    };

export const settingsSections: readonly {
  id: SectionId;
  label: string;
  icon: IconComponent;
}[] = [
  { id: "general", label: "General", icon: Monitor },
  { id: "query", label: "Query", icon: Database },
  { id: "editor", label: "Editor", icon: Keyboard },
  { id: "exports", label: "Exports", icon: Download },
  { id: "privacy", label: "Privacy", icon: Shield },
];

export const settingsFields: readonly SettingsField[] = [
  {
    kind: "segment",
    key: "theme",
    section: "general",
    title: "Theme",
    description: "Choose the app color mode.",
    options: [
      { value: "system", label: "System", icon: <Monitor size={13} /> },
      { value: "light", label: "Light", icon: <Sun size={13} /> },
      { value: "dark", label: "Dark", icon: <Moon size={13} /> },
    ],
  },
  {
    kind: "segment",
    key: "cursorMode",
    section: "general",
    title: "Cursor style",
    description: "Choose how clickable controls present the pointer.",
    options: [
      { value: "default", label: "Default", icon: <Eye size={13} /> },
      { value: "pointer", label: "Pointer", icon: <MousePointer size={13} /> },
    ],
  },
  {
    kind: "toggle",
    key: "confirmDestructiveSql",
    section: "query",
    title: "Warn before destructive SQL",
    description: "Ask for confirmation before running destructive statements.",
  },
  {
    kind: "number",
    key: "queryLimit",
    section: "query",
    title: "Default row limit",
    description: "Rows returned by generated query limits.",
  },
  {
    kind: "number",
    key: "queryTimeoutSeconds",
    section: "query",
    title: "Query timeout",
    description: "Seconds before a running query times out.",
  },
  {
    kind: "toggle",
    key: "vimNavigationEnabled",
    section: "editor",
    title: "Vim navigation in query writer",
    description: "Use Vim key bindings in the SQL editor.",
  },
  {
    kind: "textarea",
    key: "chatResponsePrompt",
    section: "editor",
    title: "Chat response prompt",
    description: "Default style guidance for assistant replies.",
    placeholder: "Talk to me like Keanu Reeves",
    wide: true,
  },
  {
    kind: "text",
    key: "exportDirectory",
    section: "exports",
    title: "Export folder",
    description: "Leave blank to use the system Downloads folder.",
    placeholder: "~/Downloads",
    resetValue: "",
    resetTitle: "Use system Downloads folder",
    wide: true,
  },
  {
    kind: "toggle",
    key: "telemetryEnabled",
    section: "privacy",
    title: "Share anonymous diagnostics",
    description: "Send install counts and crash reports without database content.",
  },
] as const;
