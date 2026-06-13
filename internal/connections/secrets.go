package connections

import (
	"context"
	"encoding/json"
	"errors"
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
	mu      sync.RWMutex
	ring    keyring.Keyring
	loaded  bool
	secrets map[string]string
}

const bundledSecretsKey = "datapanel:secrets:v1"

func NewOSKeyringStore(serviceName string) (*OSKeyringStore, error) {
	ring, err := keyring.Open(keyring.Config{
		ServiceName: serviceName,
	})
	if err != nil {
		return nil, err
	}
	return &OSKeyringStore{
		ring:    ring,
		secrets: map[string]string{},
	}, nil
}

func (s *OSKeyringStore) Save(ctx context.Context, profileID string, password string) error {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadBundleLocked(); err != nil {
		return apperrors.New(apperrors.CodeSecurity, "Keychain access required")
	}
	s.secrets[profileID] = password
	if err := s.saveBundleLocked(); err != nil {
		return apperrors.New(apperrors.CodeSecurity, "could not save secret")
	}
	return nil
}

func (s *OSKeyringStore) Get(ctx context.Context, profileID string) (string, error) {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadBundleLocked(); err != nil {
		return "", apperrors.New(apperrors.CodeSecurity, "Keychain access required")
	}
	if secret, ok := s.secrets[profileID]; ok {
		return secret, nil
	}
	secret, err := s.getLegacySecretLocked(profileID)
	if err != nil {
		if !errors.Is(err, keyring.ErrKeyNotFound) {
			return "", apperrors.New(apperrors.CodeSecurity, "Keychain access required")
		}
		return "", apperrors.New(apperrors.CodeSecurity, "saved password not found")
	}
	return secret, nil
}

func (s *OSKeyringStore) Delete(ctx context.Context, profileID string) error {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadBundleLocked(); err != nil {
		return apperrors.New(apperrors.CodeSecurity, "Keychain access required")
	}
	delete(s.secrets, profileID)
	if err := s.saveBundleLocked(); err != nil {
		return apperrors.New(apperrors.CodeSecurity, "could not delete secret")
	}
	_ = s.ring.Remove(profileID)
	return nil
}

func (s *OSKeyringStore) loadBundleLocked() error {
	if s.loaded {
		return nil
	}
	s.loaded = true
	item, err := s.ring.Get(bundledSecretsKey)
	if err != nil {
		if !errors.Is(err, keyring.ErrKeyNotFound) {
			s.loaded = false
			return err
		}
		s.secrets = map[string]string{}
		return nil
	}
	var secrets map[string]string
	if err := json.Unmarshal(item.Data, &secrets); err != nil {
		s.secrets = map[string]string{}
		return nil
	}
	if secrets == nil {
		secrets = map[string]string{}
	}
	s.secrets = secrets
	return nil
}

func (s *OSKeyringStore) saveBundleLocked() error {
	payload, err := json.Marshal(s.secrets)
	if err != nil {
		return err
	}
	return s.ring.Set(keyring.Item{Key: bundledSecretsKey, Data: payload})
}

func (s *OSKeyringStore) getLegacySecretLocked(key string) (string, error) {
	item, err := s.ring.Get(key)
	if err != nil {
		return "", err
	}
	secret := string(item.Data)
	s.secrets[key] = secret
	_ = s.saveBundleLocked()
	return secret, nil
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
