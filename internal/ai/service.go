package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"datapanel/internal/apperrors"
)

type SecretStore interface {
	Save(ctx context.Context, key string, secret string) error
	Get(ctx context.Context, key string) (string, error)
	Delete(ctx context.Context, key string) error
}

type Service struct {
	secrets SecretStore
	storage string
	client  *http.Client
}

type credentialRecord struct {
	Token     string `json:"token"`
	Label     string `json:"label"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

var providers = []string{"openai", "anthropic", "custom"}

func NewService(secrets SecretStore, storage string) *Service {
	if strings.TrimSpace(storage) == "" {
		storage = "keychain"
	}
	return &Service{
		secrets: secrets,
		storage: storage,
		client:  &http.Client{Timeout: 45 * time.Second},
	}
}

func (s *Service) ListCredentials() ([]CredentialStatus, error) {
	statuses := make([]CredentialStatus, 0, len(providers))
	for _, provider := range providers {
		status, err := s.GetCredentialStatus(provider)
		if err != nil {
			return nil, err
		}
		statuses = append(statuses, status)
	}
	return statuses, nil
}

func (s *Service) GetCredentialStatus(provider string) (CredentialStatus, error) {
	normalized, err := normalizeProvider(provider)
	if err != nil {
		return CredentialStatus{}, err
	}

	record, found := s.readRecord(normalized)
	if !found {
		return CredentialStatus{
			Provider: normalized,
			Storage:  s.storage,
		}, nil
	}

	return CredentialStatus{
		Provider:  normalized,
		Connected: true,
		KeyHint:   keyHint(record.Token),
		Label:     record.Label,
		UpdatedAt: record.UpdatedAt,
		Storage:   s.storage,
	}, nil
}

func (s *Service) SaveCredential(input SaveCredentialRequest) (CredentialStatus, error) {
	provider, err := normalizeProvider(input.Provider)
	if err != nil {
		return CredentialStatus{}, err
	}

	token := strings.TrimSpace(input.Token)
	if len(token) < 8 {
		return CredentialStatus{}, apperrors.New(apperrors.CodeValidation, "provider token is required")
	}

	now := time.Now().UTC().Format(time.RFC3339)
	record, found := s.readRecord(provider)
	if !found {
		record.CreatedAt = now
	}
	record.Token = token
	record.Label = strings.TrimSpace(input.Label)
	record.UpdatedAt = now

	payload, err := json.Marshal(record)
	if err != nil {
		return CredentialStatus{}, apperrors.New(apperrors.CodeStorage, "could not encode provider credential")
	}

	if err := s.secrets.Save(context.Background(), credentialKey(provider), string(payload)); err != nil {
		return CredentialStatus{}, apperrors.New(apperrors.CodeSecurity, "could not save provider credential")
	}

	return s.GetCredentialStatus(provider)
}

func (s *Service) DeleteCredential(provider string) error {
	normalized, err := normalizeProvider(provider)
	if err != nil {
		return err
	}
	_ = s.secrets.Delete(context.Background(), credentialKey(normalized))
	return nil
}

func (s *Service) GenerateSQL(input GenerateRequest) (GenerateResponse, error) {
	provider, err := normalizeProvider(input.Provider)
	if err != nil {
		return GenerateResponse{}, err
	}
	if provider == "custom" {
		return GenerateResponse{}, apperrors.New(apperrors.CodeValidation, "custom AI providers need a configured endpoint before chat can run")
	}

	prompt := strings.TrimSpace(input.Prompt)
	if prompt == "" {
		return GenerateResponse{}, apperrors.New(apperrors.CodeValidation, "prompt is required")
	}

	record, found := s.readRecord(provider)
	if !found {
		return GenerateResponse{}, apperrors.New(apperrors.CodeSecurity, "AI provider is not connected")
	}

	system := systemPrompt(input.Dialect)
	user := strings.Join([]string{
		"Database schema context:",
		strings.TrimSpace(input.SchemaContext),
		"",
		"User request:",
		prompt,
	}, "\n")

	switch provider {
	case "openai":
		return s.generateOpenAI(record.Token, normalizeModel(provider, input.Model), system, user)
	case "anthropic":
		return s.generateAnthropic(record.Token, normalizeModel(provider, input.Model), system, user)
	default:
		return GenerateResponse{}, apperrors.New(apperrors.CodeValidation, "unsupported AI provider")
	}
}

func (s *Service) generateOpenAI(token string, model string, system string, user string) (GenerateResponse, error) {
	payload := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"temperature":     0.2,
		"response_format": map[string]string{"type": "json_object"},
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := s.postJSON("https://api.openai.com/v1/chat/completions", map[string]string{
		"Authorization": "Bearer " + strings.TrimSpace(token),
	}, payload, &parsed); err != nil {
		return GenerateResponse{}, err
	}
	if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
		return GenerateResponse{}, apperrors.New(apperrors.CodeValidation, parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return GenerateResponse{}, apperrors.New(apperrors.CodeValidation, "AI provider returned no response")
	}
	return parseGenerateResponse(parsed.Choices[0].Message.Content)
}

func (s *Service) generateAnthropic(token string, model string, system string, user string) (GenerateResponse, error) {
	payload := map[string]any{
		"model":       model,
		"max_tokens":  1200,
		"temperature": 0.2,
		"system":      system,
		"messages": []map[string]string{
			{"role": "user", "content": user},
		},
	}

	var parsed struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := s.postJSON("https://api.anthropic.com/v1/messages", map[string]string{
		"x-api-key":         strings.TrimSpace(token),
		"anthropic-version": "2023-06-01",
	}, payload, &parsed); err != nil {
		return GenerateResponse{}, err
	}
	if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
		return GenerateResponse{}, apperrors.New(apperrors.CodeValidation, parsed.Error.Message)
	}
	for _, block := range parsed.Content {
		if block.Type == "text" && strings.TrimSpace(block.Text) != "" {
			return parseGenerateResponse(block.Text)
		}
	}
	return GenerateResponse{}, apperrors.New(apperrors.CodeValidation, "AI provider returned no response")
}

func (s *Service) postJSON(endpoint string, headers map[string]string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return apperrors.New(apperrors.CodeValidation, "could not encode AI request")
	}

	request, err := http.NewRequestWithContext(context.Background(), http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return apperrors.New(apperrors.CodeValidation, "could not create AI request")
	}
	request.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		request.Header.Set(key, value)
	}

	response, err := s.client.Do(request)
	if err != nil {
		return apperrors.New(apperrors.CodeValidation, "AI request failed")
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1_000_000))
	if err != nil {
		return apperrors.New(apperrors.CodeValidation, "could not read AI response")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return providerHTTPError(response.StatusCode, responseBody)
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return apperrors.New(apperrors.CodeValidation, "could not parse AI response")
	}
	return nil
}

func (s *Service) readRecord(provider string) (credentialRecord, bool) {
	payload, err := s.secrets.Get(context.Background(), credentialKey(provider))
	if err != nil {
		return credentialRecord{}, false
	}

	var record credentialRecord
	if err := json.Unmarshal([]byte(payload), &record); err != nil {
		// Older builds stored raw values during development. Treat that value as
		// the token, but never return it to the frontend.
		record.Token = payload
	}
	return record, strings.TrimSpace(record.Token) != ""
}

func normalizeProvider(provider string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(provider))
	for _, allowed := range providers {
		if normalized == allowed {
			return normalized, nil
		}
	}
	return "", apperrors.New(apperrors.CodeValidation, "unsupported AI provider")
}

func normalizeModel(provider string, model string) string {
	normalized := strings.TrimSpace(model)
	if normalized != "" {
		return normalized
	}
	if provider == "anthropic" {
		return "claude-3-5-haiku-latest"
	}
	return "gpt-4.1-mini"
}

func credentialKey(provider string) string {
	return "ai:" + provider
}

func keyHint(token string) string {
	trimmed := strings.TrimSpace(token)
	if len(trimmed) < 4 {
		return "stored"
	}
	return "...." + trimmed[len(trimmed)-4:]
}

func systemPrompt(dialect string) string {
	normalizedDialect := "Postgres"
	if strings.EqualFold(strings.TrimSpace(dialect), "mysql") {
		normalizedDialect = "MySQL"
	}
	return strings.Join([]string{
		"You are Datapanel's database assistant.",
		"Return a JSON object with fields: answer, sql, destructiveRisk, assumptions.",
		`Use an empty string for "sql" when no SQL is needed.`,
		`Use an array of strings for "assumptions".`,
		"Use only the schema context provided. If a table or column is missing, say what you are assuming.",
		"Prefer one clear SQL statement unless the user asks for a multi-step script.",
		"Prefer read-only SELECT queries unless the user explicitly asks to modify data.",
		"Mark destructiveRisk true for INSERT, UPDATE, DELETE, ALTER, DROP, TRUNCATE, or other data-changing SQL.",
		"The SQL dialect is " + normalizedDialect + ".",
	}, "\n")
}

func parseGenerateResponse(content string) (GenerateResponse, error) {
	var parsed GenerateResponse
	if err := json.Unmarshal([]byte(strings.TrimSpace(content)), &parsed); err != nil {
		return GenerateResponse{}, apperrors.New(apperrors.CodeValidation, "AI response was not valid JSON")
	}
	parsed.Answer = strings.TrimSpace(parsed.Answer)
	parsed.SQL = strings.TrimSpace(parsed.SQL)
	if parsed.Assumptions == nil {
		parsed.Assumptions = []string{}
	}
	if parsed.Answer == "" && parsed.SQL == "" {
		return GenerateResponse{}, apperrors.New(apperrors.CodeValidation, "AI response was empty")
	}
	return parsed, nil
}

func providerHTTPError(statusCode int, responseBody []byte) error {
	var parsed struct {
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(responseBody, &parsed); err == nil && parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
		return apperrors.New(apperrors.CodeValidation, parsed.Error.Message)
	}
	return apperrors.New(apperrors.CodeValidation, "AI provider returned HTTP "+http.StatusText(statusCode))
}
