import type { ErrorInfo } from "react";
import type posthog from "posthog-js";
import type { AppSettings } from "./types";

type TelemetryProperties = Record<string, string | number | boolean | null>;
type PostHogClient = typeof posthog;

const posthogToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim() ?? "";
const posthogHost = import.meta.env.VITE_POSTHOG_HOST?.trim() ?? "";
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

export async function trackTelemetryFirstLaunch(settings = telemetrySettings) {
  return capture("datapanel_install_first_launch", baseProperties(settings));
}

export async function trackAppOpened(settings = telemetrySettings) {
  return capture("datapanel_app_opened", baseProperties(settings));
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
      settings.telemetryInstallId.trim() !== "",
  );
}

function baseProperties(settings: AppSettings | null): TelemetryProperties {
  return {
    app: "datapanel",
    telemetry_install_id: settings?.telemetryInstallId.trim() || null,
  };
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
