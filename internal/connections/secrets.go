package connections

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"

	"datapanel/internal/apperrors"

	"github.com/99designs/keyring"
)

type SecretStore interface {
	Save(ctx context.Context, profileID string, password string) error
	Get(ctx context.Context, profileID string) (string, error)
	Delete(ctx context.Context, profileID string) error
	RequestAccess(ctx context.Context) error
}

type OSKeyringStore struct {
	mu      sync.RWMutex
	ring    keyring.Keyring
	loaded  bool
	blocked bool
	bundle  secretBundle
}

const bundledSecretsKey = "datapanel:secrets:v1"
const keychainAccessRequiredMessage = "Keychain access required"
const aiSecretPrefix = "ai:"

type secretBundle struct {
	DBPasswords   map[string]string `json:"dbPasswords"`
	AICredentials map[string]string `json:"aiCredentials"`
}

func NewOSKeyringStore(serviceName string) (*OSKeyringStore, error) {
	ring, err := keyring.Open(keyring.Config{
		ServiceName: serviceName,
	})
	if err != nil {
		return nil, err
	}
	return &OSKeyringStore{
		ring:   ring,
		bundle: newSecretBundle(),
	}, nil
}

func (s *OSKeyringStore) Save(ctx context.Context, profileID string, password string) error {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadBundleLocked(); err != nil {
		return keychainAccessRequiredError()
	}
	s.bundle.set(profileID, password)
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
		return "", keychainAccessRequiredError()
	}
	if secret, ok := s.bundle.get(profileID); ok {
		return secret, nil
	}
	secret, err := s.getLegacySecretLocked(profileID)
	if err != nil {
		if !errors.Is(err, keyring.ErrKeyNotFound) {
			s.blocked = true
			return "", keychainAccessRequiredError()
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
		return keychainAccessRequiredError()
	}
	s.bundle.delete(profileID)
	if err := s.saveBundleLocked(); err != nil {
		return apperrors.New(apperrors.CodeSecurity, "could not delete secret")
	}
	_ = s.ring.Remove(profileID)
	return nil
}

func (s *OSKeyringStore) RequestAccess(ctx context.Context) error {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	s.blocked = false
	s.loaded = false
	if err := s.loadBundleLocked(); err != nil {
		return keychainAccessRequiredError()
	}
	return nil
}

func (s *OSKeyringStore) loadBundleLocked() error {
	if s.blocked {
		return keychainAccessRequiredError()
	}
	if s.loaded {
		return nil
	}
	s.loaded = true
	item, err := s.ring.Get(bundledSecretsKey)
	if err != nil {
		if !errors.Is(err, keyring.ErrKeyNotFound) {
			s.loaded = false
			s.blocked = true
			return err
		}
		s.bundle = newSecretBundle()
		s.blocked = false
		return nil
	}
	s.bundle = parseSecretBundle(item.Data)
	s.blocked = false
	return nil
}

func (s *OSKeyringStore) saveBundleLocked() error {
	s.bundle.ensure()
	payload, err := json.Marshal(s.bundle)
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
	s.bundle.set(key, secret)
	_ = s.saveBundleLocked()
	return secret, nil
}

func newSecretBundle() secretBundle {
	return secretBundle{
		DBPasswords:   map[string]string{},
		AICredentials: map[string]string{},
	}
}

func parseSecretBundle(data []byte) secretBundle {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err == nil {
		if _, hasDBPasswords := raw["dbPasswords"]; hasDBPasswords {
			var bundle secretBundle
			if err := json.Unmarshal(data, &bundle); err == nil {
				bundle.ensure()
				return bundle
			}
		}
		if _, hasAICredentials := raw["aiCredentials"]; hasAICredentials {
			var bundle secretBundle
			if err := json.Unmarshal(data, &bundle); err == nil {
				bundle.ensure()
				return bundle
			}
		}
	}

	var flat map[string]string
	if err := json.Unmarshal(data, &flat); err != nil {
		return newSecretBundle()
	}
	bundle := newSecretBundle()
	for key, value := range flat {
		bundle.set(key, value)
	}
	return bundle
}

func (b *secretBundle) ensure() {
	if b.DBPasswords == nil {
		b.DBPasswords = map[string]string{}
	}
	if b.AICredentials == nil {
		b.AICredentials = map[string]string{}
	}
}

func (b *secretBundle) get(key string) (string, bool) {
	b.ensure()
	if provider, ok := aiCredentialProvider(key); ok {
		value, found := b.AICredentials[provider]
		return value, found
	}
	value, found := b.DBPasswords[key]
	return value, found
}

func (b *secretBundle) set(key string, value string) {
	b.ensure()
	if provider, ok := aiCredentialProvider(key); ok {
		b.AICredentials[provider] = value
		return
	}
	b.DBPasswords[key] = value
}

func (b *secretBundle) delete(key string) {
	b.ensure()
	if provider, ok := aiCredentialProvider(key); ok {
		delete(b.AICredentials, provider)
		return
	}
	delete(b.DBPasswords, key)
}

func aiCredentialProvider(key string) (string, bool) {
	provider, ok := strings.CutPrefix(key, aiSecretPrefix)
	return provider, ok
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

func (s *MemorySecretStore) RequestAccess(ctx context.Context) error {
	_ = ctx
	return nil
}

func keychainAccessRequiredError() error {
	return apperrors.New(apperrors.CodeSecurity, keychainAccessRequiredMessage)
}
