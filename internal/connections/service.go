package connections

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net"
	"strconv"
	"strings"
	"time"

	"datapanel/internal/apperrors"
)

const defaultConnectTimeout = 8 * time.Second

type DatabaseConnector interface {
	Test(ctx context.Context, profile ConnectionProfile, password string) error
	Connect(ctx context.Context, profile ConnectionProfile, password string) error
	Disconnect(ctx context.Context, profileID string) error
}

type Service struct {
	store     ProfileStore
	secrets   SecretStore
	connector DatabaseConnector
}

func NewService(store ProfileStore, secrets SecretStore, connector DatabaseConnector) *Service {
	return &Service{store: store, secrets: secrets, connector: connector}
}

func (s *Service) ListConnections() ([]ConnectionProfile, error) {
	return s.store.List()
}

func (s *Service) SaveConnection(input SaveConnectionRequest) (ConnectionProfile, error) {
	inputHadID := strings.TrimSpace(input.ID) != ""
	profile, err := profileFromSaveInput(input)
	if err != nil {
		return ConnectionProfile{}, err
	}

	existing, err := s.store.Find(profile.ID)
	if err == nil {
		profile.CreatedAt = existing.CreatedAt
	}

	password := strings.TrimSpace(input.Password)
	clearSavedSecret := password == "" && shouldClearSavedSecret(err == nil, inputHadID, existing, profile)
	if clearSavedSecret {
		if err := s.secrets.Delete(context.Background(), profile.ID); err != nil {
			return ConnectionProfile{}, apperrors.New(apperrors.CodeSecurity, "could not clear saved password")
		}
	}

	if err := s.store.Save(profile); err != nil {
		return ConnectionProfile{}, err
	}
	if password != "" {
		if err := s.secrets.Save(context.Background(), profile.ID, input.Password); err != nil {
			return ConnectionProfile{}, apperrors.New(apperrors.CodeSecurity, "could not save password")
		}
	}

	return profile, nil
}

func (s *Service) DeleteConnection(profileID string) error {
	if strings.TrimSpace(profileID) == "" {
		return apperrors.New(apperrors.CodeValidation, "profile id is required")
	}
	if err := s.connector.Disconnect(context.Background(), profileID); err != nil {
		return err
	}
	_ = s.secrets.Delete(context.Background(), profileID)
	return s.store.Delete(profileID)
}

func (s *Service) TestConnection(input TestConnectionRequest) (ConnectionStatus, error) {
	profile, err := profileFromTestInput(input)
	if err != nil {
		return ConnectionStatus{}, err
	}

	password := input.Password

	ctx, cancel := context.WithTimeout(context.Background(), defaultConnectTimeout)
	defer cancel()
	if err := s.connector.Test(ctx, profile, password); err != nil {
		return ConnectionStatus{ProfileID: profile.ID, Connected: false, Message: "Connection failed"}, err
	}

	return ConnectionStatus{ProfileID: profile.ID, Connected: true, Message: "Connection successful"}, nil
}

func (s *Service) Connect(input ConnectRequest) (ConnectionStatus, error) {
	if strings.TrimSpace(input.ProfileID) == "" {
		return ConnectionStatus{}, apperrors.New(apperrors.CodeValidation, "profile id is required")
	}

	profile, err := s.store.Find(input.ProfileID)
	if err != nil {
		return ConnectionStatus{}, err
	}

	password := input.Password
	if password == "" {
		requiresSecret := requiresSavedSecret(profile)
		if input.ReconnectSecureStorage || requiresSecret {
			if err := s.secrets.RequestAccess(context.Background()); err != nil {
				if requiresSecret {
					return ConnectionStatus{}, err
				}
			}
		}
		savedPassword, err := s.secrets.Get(context.Background(), profile.ID)
		if err != nil && requiresSecret {
			return ConnectionStatus{}, err
		}
		password = savedPassword
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultConnectTimeout)
	defer cancel()
	if err := s.connector.Connect(ctx, profile, password); err != nil {
		return ConnectionStatus{ProfileID: profile.ID, Connected: false, Message: "Connection failed"}, err
	}

	return ConnectionStatus{ProfileID: profile.ID, Connected: true, Message: "Connected"}, nil
}

func requiresSavedSecret(profile ConnectionProfile) bool {
	return profile.Driver != "bigquery"
}

func shouldClearSavedSecret(foundExisting bool, inputHadID bool, existing ConnectionProfile, profile ConnectionProfile) bool {
	if !foundExisting {
		return inputHadID
	}
	if profile.Driver == "bigquery" {
		return true
	}
	return savedSecretScopeChanged(existing, profile)
}

func savedSecretScopeChanged(left ConnectionProfile, right ConnectionProfile) bool {
	return left.Driver != right.Driver ||
		left.Host != right.Host ||
		left.Port != right.Port ||
		left.Database != right.Database ||
		left.Username != right.Username ||
		left.Endpoint != right.Endpoint ||
		left.SSLMode != right.SSLMode
}

func (s *Service) Disconnect(profileID string) error {
	if strings.TrimSpace(profileID) == "" {
		return apperrors.New(apperrors.CodeValidation, "profile id is required")
	}
	return s.connector.Disconnect(context.Background(), profileID)
}

func profileFromSaveInput(input SaveConnectionRequest) (ConnectionProfile, error) {
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = newID()
	}
	now := time.Now().UTC().Format(time.RFC3339)
	host, port := splitHostPort(strings.TrimSpace(input.Host), input.Port)
	profile := ConnectionProfile{
		ID:        id,
		Driver:    normalizeDriver(input.Driver),
		Name:      strings.TrimSpace(input.Name),
		Host:      normalizeHost(host),
		Port:      port,
		Database:  strings.TrimSpace(input.Database),
		Username:  strings.TrimSpace(input.Username),
		Endpoint:  normalizeEndpoint(input.Endpoint),
		SSLMode:   normalizeSSLMode(input.SSLMode),
		Color:     normalizeColor(input.Color),
		CreatedAt: now,
		UpdatedAt: now,
	}
	return profile, validateProfile(profile)
}

func profileFromTestInput(input TestConnectionRequest) (ConnectionProfile, error) {
	saveInput := SaveConnectionRequest{
		ID:       input.ProfileID,
		Driver:   input.Driver,
		Name:     input.Name,
		Host:     input.Host,
		Port:     input.Port,
		Database: input.Database,
		Username: input.Username,
		Endpoint: input.Endpoint,
		SSLMode:  input.SSLMode,
		Color:    input.Color,
	}
	return profileFromSaveInput(saveInput)
}

func validateProfile(profile ConnectionProfile) error {
	if profile.Driver != "postgres" && profile.Driver != "mysql" && profile.Driver != "bigquery" {
		return apperrors.New(apperrors.CodeValidation, "database driver must be postgres, mysql, or bigquery")
	}
	if strings.TrimSpace(profile.Name) == "" {
		return apperrors.New(apperrors.CodeValidation, "No name entered")
	}
	if strings.TrimSpace(profile.Host) == "" {
		if profile.Driver == "bigquery" {
			return apperrors.New(apperrors.CodeValidation, "project id is required")
		}
		return apperrors.New(apperrors.CodeValidation, "host is required")
	}
	if profile.Driver != "bigquery" && (profile.Port <= 0 || profile.Port > 65535) {
		return apperrors.New(apperrors.CodeValidation, "port must be between 1 and 65535")
	}
	if profile.Driver != "bigquery" && strings.TrimSpace(profile.Database) == "" {
		return apperrors.New(apperrors.CodeValidation, "database is required")
	}
	if profile.Driver != "bigquery" && strings.TrimSpace(profile.Username) == "" {
		return apperrors.New(apperrors.CodeValidation, "username is required")
	}
	return nil
}

func normalizeDriver(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "mysql":
		return "mysql"
	case "bigquery":
		return "bigquery"
	default:
		return "postgres"
	}
}

func normalizeHost(value string) string {
	host := strings.TrimSpace(value)
	if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
		return strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")
	}
	return host
}

func normalizeEndpoint(value string) string {
	return strings.TrimRight(strings.TrimSpace(value), "/")
}

func splitHostPort(host string, fallbackPort int) (string, int) {
	if host == "" {
		return host, fallbackPort
	}

	parsedHost, parsedPort, err := net.SplitHostPort(host)
	if err != nil {
		return host, fallbackPort
	}

	port, err := strconv.Atoi(parsedPort)
	if err != nil {
		return normalizeHost(parsedHost), fallbackPort
	}

	return normalizeHost(parsedHost), port
}

func normalizeSSLMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "disable", "allow", "prefer", "require", "verify-ca", "verify-full":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "prefer"
	}
}

func normalizeColor(value string) string {
	color := strings.TrimSpace(value)
	if color == "" {
		return "#5E6AD2"
	}
	return color
}

func newID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return time.Now().UTC().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(bytes[:])
}
