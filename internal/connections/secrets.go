package connections

import (
	"context"
	"sync"

	"datapanel/internal/apperrors"

	"github.com/99designs/keyring"
)

type SecretStore interface {
	Save(ctx context.Context, profileID string, password string) error
	Get(ctx context.Context, profileID string) (string, error)
	Delete(ctx context.Context, profileID string) error
}

type OSKeyringStore struct {
	ring keyring.Keyring
}

func NewOSKeyringStore(serviceName string) (*OSKeyringStore, error) {
	ring, err := keyring.Open(keyring.Config{
		ServiceName: serviceName,
	})
	if err != nil {
		return nil, err
	}
	return &OSKeyringStore{ring: ring}, nil
}

func (s *OSKeyringStore) Save(ctx context.Context, profileID string, password string) error {
	_ = ctx
	return s.ring.Set(keyring.Item{Key: profileID, Data: []byte(password)})
}

func (s *OSKeyringStore) Get(ctx context.Context, profileID string) (string, error) {
	_ = ctx
	item, err := s.ring.Get(profileID)
	if err != nil {
		return "", apperrors.New(apperrors.CodeSecurity, "saved password not found")
	}
	return string(item.Data), nil
}

func (s *OSKeyringStore) Delete(ctx context.Context, profileID string) error {
	_ = ctx
	return s.ring.Remove(profileID)
}

type MemorySecretStore struct {
	mu      sync.RWMutex
	secrets map[string]string
}

func NewMemorySecretStore() *MemorySecretStore {
	return &MemorySecretStore{secrets: map[string]string{}}
}

func (s *MemorySecretStore) Save(ctx context.Context, profileID string, password string) error {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	s.secrets[profileID] = password
	return nil
}

func (s *MemorySecretStore) Get(ctx context.Context, profileID string) (string, error) {
	_ = ctx
	s.mu.RLock()
	defer s.mu.RUnlock()
	secret, ok := s.secrets[profileID]
	if !ok {
		return "", apperrors.New(apperrors.CodeSecurity, "saved password not found")
	}
	return secret, nil
}

func (s *MemorySecretStore) Delete(ctx context.Context, profileID string) error {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.secrets, profileID)
	return nil
}
