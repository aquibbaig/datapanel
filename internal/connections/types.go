package connections

type ConnectionProfile struct {
	ID        string `json:"id"`
	Driver    string `json:"driver"`
	Name      string `json:"name"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	Database  string `json:"database"`
	Username  string `json:"username"`
	Endpoint  string `json:"endpoint"`
	SSLMode   string `json:"sslMode"`
	Color     string `json:"color"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type SaveConnectionRequest struct {
	ID       string `json:"id"`
	Driver   string `json:"driver"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Database string `json:"database"`
	Username string `json:"username"`
	Endpoint string `json:"endpoint"`
	Password string `json:"password"`
	SSLMode  string `json:"sslMode"`
	Color    string `json:"color"`
}

type TestConnectionRequest struct {
	ProfileID string `json:"profileId"`
	Driver    string `json:"driver"`
	Name      string `json:"name"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	Database  string `json:"database"`
	Username  string `json:"username"`
	Endpoint  string `json:"endpoint"`
	Password  string `json:"password"`
	SSLMode   string `json:"sslMode"`
	Color     string `json:"color"`
}

type ConnectRequest struct {
	ProfileID         string `json:"profileId"`
	Password          string `json:"password"`
	ReconnectKeychain bool   `json:"reconnectKeychain"`
}

type ConnectionStatus struct {
	ProfileID string `json:"profileId"`
	Connected bool   `json:"connected"`
	Message   string `json:"message"`
}
