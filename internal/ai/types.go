package ai

type SaveCredentialRequest struct {
	Provider string `json:"provider"`
	Token    string `json:"token"`
	Label    string `json:"label"`
}

type CredentialStatus struct {
	Provider  string `json:"provider"`
	Connected bool   `json:"connected"`
	KeyHint   string `json:"keyHint"`
	Label     string `json:"label"`
	UpdatedAt string `json:"updatedAt"`
	Storage   string `json:"storage"`
}

type ChatTurn struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type GenerateRequest struct {
	Provider      string     `json:"provider"`
	Model         string     `json:"model"`
	Prompt        string     `json:"prompt"`
	SchemaContext string     `json:"schemaContext"`
	Dialect       string     `json:"dialect"`
	ResponseStyle string     `json:"responseStyle"`
	Conversation  []ChatTurn `json:"conversation,omitempty"`
}

type PlanRequest struct {
	Provider     string     `json:"provider"`
	Model        string     `json:"model"`
	Prompt       string     `json:"prompt"`
	TableContext string     `json:"tableContext"`
	Dialect      string     `json:"dialect"`
	Conversation []ChatTurn `json:"conversation,omitempty"`
}

type PlanTable struct {
	Schema     string  `json:"schema"`
	Name       string  `json:"name"`
	Confidence float64 `json:"confidence"`
	Reason     string  `json:"reason"`
}

type PlanResponse struct {
	NeedsClarification bool        `json:"needsClarification"`
	Question           string      `json:"question"`
	Tables             []PlanTable `json:"tables"`
	Assumptions        []string    `json:"assumptions"`
	TokenUsage         TokenUsage  `json:"tokenUsage"`
}

type GenerateResponse struct {
	Answer          string      `json:"answer"`
	SQL             string      `json:"sql"`
	DestructiveRisk bool        `json:"destructiveRisk"`
	Assumptions     []string    `json:"assumptions"`
	MissingTables   []PlanTable `json:"missingTables,omitempty"`
	TokenUsage      TokenUsage  `json:"tokenUsage"`
}

type TokenUsage struct {
	PromptTokens     int `json:"promptTokens"`
	CompletionTokens int `json:"completionTokens"`
	TotalTokens      int `json:"totalTokens"`
}
