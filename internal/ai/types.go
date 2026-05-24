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

type GenerateRequest struct {
	Provider      string `json:"provider"`
	Model         string `json:"model"`
	Prompt        string `json:"prompt"`
	SchemaContext string `json:"schemaContext"`
	Dialect       string `json:"dialect"`
}

type GenerateResponse struct {
	Answer          string   `json:"answer"`
	SQL             string   `json:"sql"`
	DestructiveRisk bool     `json:"destructiveRisk"`
	Assumptions     []string `json:"assumptions"`
}
