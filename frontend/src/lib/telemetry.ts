import type { ErrorInfo } from "react";
import type posthog from "posthog-js";
import type { AppSettings } from "./types";

type TelemetryProperties = Record<string, string | number | boolean | null>;
type PostHogClient = typeof posthog;

const defaultPosthogToken = "phc_wGsopSafUkaBkGME8r5u8k5TAc5VSjXsb3pf3oxqm4cd";
const defaultPosthogHost = "https://us.i.posthog.com";
const posthogToken =
  import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim() || defaultPosthogToken;
const posthogHost =
  import.meta.env.VITE_POSTHOG_HOST?.trim() || defaultPosthogHost;
const configured = Boolean(posthogToken && posthogHost);

let initialized = false;
let telemetrySettings: AppSettings | null = null;
let posthogClient: PostHogClient | null = null;
let posthogLoadPromise: Promise<PostHogClient | null> | null = null;

export async function configureTelemetry(settings: AppSettings | null) {
  telemetrySettings = settings;

  if (!configured) return false;

  if (!isTelemetryEnabled(settings)) {
    posthogClient?.opt_out_capturing();
    return false;
  }

  const client = await loadPostHog();
  if (!client) return false;
  client.opt_in_capturing({ captureEventName: false });
  return true;
}

async function loadPostHog() {
  if (posthogClient) return posthogClient;
  if (!posthogLoadPromise) {
    posthogLoadPromise = import("posthog-js")
      .then((module) => {
        const client = module.default;
        client.init(posthogToken, {
          api_host: posthogHost,
          autocapture: false,
          capture_exceptions: false,
          capture_pageleave: false,
          capture_pageview: false,
          disable_session_recording: true,
          mask_all_text: true,
          opt_out_persistence_by_default: true,
          persistence: "memory",
          person_profiles: "never",
          respect_dnt: true,
        });
        initialized = true;
        posthogClient = client;
        return client;
      })
      .catch((error: unknown) => {
        console.warn("Could not load telemetry client", error);
        return null;
      });
  }
  return posthogLoadPromise;
}

async function enabledPostHogClient() {
  if (!isTelemetryEnabled(telemetrySettings)) return null;
  if (!initialized) {
    return configureTelemetry(telemetrySettings).then(() => posthogClient);
  }
  if (posthogClient) {
    posthogClient.opt_in_capturing({ captureEventName: false });
    return posthogClient;
  } else {
    return null;
  }
}

async function configuredPostHogClient() {
  if (!configured) return null;
  const client = await loadPostHog();
  if (!client) return null;
  client.opt_in_capturing({ captureEventName: false });
  return client;
}

export async function trackAppInstalled(
  userId: string,
  settings = telemetrySettings,
) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return false;
  const client = await configuredPostHogClient();
  if (!client) return false;
  client.capture("datapanel_app_installed", {
    ...baseProperties(settings),
    ...runtimeProperties(),
    distinct_id: normalizedUserId,
    userId: normalizedUserId,
    $process_person_profile: false,
  });
  return true;
}

export async function captureTelemetryBoundaryError(
  error: unknown,
  errorInfo: ErrorInfo,
) {
  const client = await enabledPostHogClient();
  if (!client) return false;

  const properties = {
    ...baseProperties(telemetrySettings),
    error_name: errorName(error),
    component_stack_lines: componentStackLineCount(
      errorInfo.componentStack ?? "",
    ),
  };

  capture("datapanel_error_boundary", properties);

  const sanitizedError = new Error("React render error");
  sanitizedError.name = errorName(error);
  sanitizedError.stack = undefined;
  client.captureException(sanitizedError, {
    ...properties,
    source: "app_error_boundary",
  });
  return true;
}

async function capture(event: string, properties: TelemetryProperties) {
  const client = await enabledPostHogClient();
  if (!client) return false;
  client.capture(event, {
    ...properties,
    $process_person_profile: false,
  });
  return true;
}

function isTelemetryEnabled(settings: AppSettings | null): settings is AppSettings {
  return Boolean(
    configured &&
      settings?.telemetryEnabled &&
      settings.userId.trim() !== "",
  );
}

function baseProperties(settings: AppSettings | null): TelemetryProperties {
  return {
    app: "datapanel",
    userId: settings?.userId.trim() || null,
  };
}

function runtimeProperties(): TelemetryProperties {
  const userAgent = navigator.userAgent || "";
  return {
    locale: navigator.language || null,
    os: operatingSystem(userAgent),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    user_agent: userAgent || null,
  };
}

function operatingSystem(userAgent: string) {
  if (userAgent.includes("Windows")) return "Windows";
  if (userAgent.includes("Mac OS X") || userAgent.includes("Macintosh")) return "macOS";
  if (userAgent.includes("Linux")) return "Linux";
  return "Unknown";
}

function errorName(error: unknown) {
  if (error instanceof Error && error.name.trim() !== "") {
    return error.name.trim().slice(0, 80);
  }
  return "Error";
}

function componentStackLineCount(componentStack: string) {
  return componentStack
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}
