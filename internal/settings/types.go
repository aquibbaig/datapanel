package settings

type AppSettings struct {
	Theme                 string `json:"theme"`
	QueryLimit            int    `json:"queryLimit"`
	QueryTimeoutSeconds   int    `json:"queryTimeoutSeconds"`
	ConfirmDestructiveSQL bool   `json:"confirmDestructiveSql"`
	SidebarWidth          int    `json:"sidebarWidth"`
	InspectorWidth        int    `json:"inspectorWidth"`
	AutoRefreshMetadata   bool   `json:"autoRefreshMetadata"`
	ChatResponsePrompt    string `json:"chatResponsePrompt"`
	CursorMode            string `json:"cursorMode"`
}

func DefaultSettings() AppSettings {
	return AppSettings{
		Theme:                 "system",
		QueryLimit:            500,
		QueryTimeoutSeconds:   30,
		ConfirmDestructiveSQL: true,
		SidebarWidth:          304,
		InspectorWidth:        360,
		AutoRefreshMetadata:   true,
		ChatResponsePrompt:    "",
		CursorMode:            "default",
	}
}
