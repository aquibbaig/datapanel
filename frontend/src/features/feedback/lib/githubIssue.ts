const githubNewIssueUrl =
  "https://github.com/aquibbaig/datapanel/issues/new";
const feedbackTitlePrefix = "[Feedback] ";
const maxIssueTitleLength = 100;

export const maxFeedbackLength = 2000;

export function buildFeedbackIssueUrl(message: string, version?: string) {
  const feedback = message.trim();
  const firstLine =
    feedback
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "User feedback";
  const titleSummary = truncateText(
    firstLine.replace(/\s+/g, " "),
    maxIssueTitleLength - feedbackTitlePrefix.length,
  );
  const normalizedVersion = version?.trim().replace(/\s+/g, " ");
  const body = normalizedVersion
    ? `${feedback}\n\n---\nDataPanel version: ${normalizedVersion}`
    : feedback;
  const url = new URL(githubNewIssueUrl);

  url.searchParams.set("title", `${feedbackTitlePrefix}${titleSummary}`);
  url.searchParams.set("body", body);
  return url.toString();
}

function truncateText(value: string, maxLength: number) {
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;
  return `${characters.slice(0, maxLength - 1).join("").trimEnd()}…`;
}
