package connections

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"datapanel/internal/apperrors"

	"github.com/99designs/keyring"
)

const vaultKeychainKey = "datapanel:vault-key:v0"
const bundledVaultKeychainKey = bundledSecretsKey
const previousVaultKeychainKey = "datapanel:vault-key:v3"
const secondVaultKeychainKey = "datapanel:vault-key:v2"
const firstVaultKeychainKey = "datapanel:vault-key:v1"
const vaultVersion = 1

type VaultSecretStore struct {
	mu        sync.RWMutex
	ring      keyring.Keyring
	vaultPath string
	loaded    bool
	blocked   bool
	key       []byte
	bundle    secretBundle
	envelope  vaultEnvelope
}

type vaultEnvelope struct {
	Version      int    `json:"version"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
	MigratedFrom string `json:"migratedFrom,omitempty"`
	MigratedAt   string `json:"migratedAt,omitempty"`
	Nonce        string `json:"nonce"`
	Ciphertext   string `json:"ciphertext"`
}

func NewVaultSecretStore(serviceName string, vaultPath string) (*VaultSecretStore, error) {
	ring, err := newVaultKeyring(serviceName)
	if err != nil {
		return nil, err
	}
	return &VaultSecretStore{
		ring:      ring,
		vaultPath: vaultPath,
		bundle:    newSecretBundle(),
	}, nil
}

func (s *VaultSecretStore) Save(ctx context.Context, profileID string, password string) error {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(); err != nil {
		return keychainAccessRequiredError()
	}
	s.bundle.set(profileID, password)
	if err := s.saveVaultLocked(); err != nil {
		return apperrors.New(apperrors.CodeSecurity, "could not save secret")
	}
	return nil
}

func (s *VaultSecretStore) Get(ctx context.Context, profileID string) (string, error) {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(); err != nil {
		return "", keychainAccessRequiredError()
	}
	secret, ok := s.bundle.get(profileID)
	if !ok {
		return "", savedSecretNotFoundError()
	}
	return secret, nil
}

func (s *VaultSecretStore) Delete(ctx context.Context, profileID string) error {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(); err != nil {
		return keychainAccessRequiredError()
	}
	s.bundle.delete(profileID)
	if err := s.saveVaultLocked(); err != nil {
		return apperrors.New(apperrors.CodeSecurity, "could not delete secret")
	}
	return nil
}

func (s *VaultSecretStore) RequestAccess(ctx context.Context) error {
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.loaded {
		return nil
	}
	s.blocked = false
	if err := s.loadLocked(); err != nil {
		return keychainAccessRequiredError()
	}
	return nil
}

func (s *VaultSecretStore) loadLocked() error {
	if s.blocked {
		return keychainAccessRequiredError()
	}
	if s.loaded {
		return nil
	}
	vaultExists := vaultFileExists(s.vaultPath)
	key, created, legacy, err := s.loadOrCreateKeyLocked(vaultExists)
	if err != nil {
		s.blocked = true
		return err
	}
	s.key = key

	if err := s.loadVaultFileLocked(); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			s.blocked = true
			return err
		}
		s.bundle = newSecretBundle()
		s.envelope = vaultEnvelope{
			Version:   vaultVersion,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}
		if legacy != nil {
			s.bundle = mergeSecretBundles(s.bundle, *legacy)
		}
		s.markLegacyCheckedLocked(legacy != nil)
		if created || bundleHasSecrets(s.bundle) || s.envelope.MigratedAt != "" {
			if err := s.saveVaultLocked(); err != nil {
				s.blocked = true
				return err
			}
		}
	}

	if strings.TrimSpace(s.envelope.MigratedAt) == "" {
		s.markLegacyCheckedLocked(false)
		if err := s.saveVaultLocked(); err != nil {
			s.blocked = true
			return err
		}
	}

	s.loaded = true
	s.blocked = false
	return nil
}

func (s *VaultSecretStore) loadOrCreateKeyLocked(vaultExists bool) ([]byte, bool, *secretBundle, error) {
	item, err := s.ring.Get(vaultKeychainKey)
	if err == nil {
		key, err := decodeVaultKey(item.Data)
		if err == nil {
			return key, false, nil, nil
		}
		return nil, false, nil, err
	}
	if !errors.Is(err, keyring.ErrKeyNotFound) {
		return nil, false, nil, err
	}

	if vaultExists {
		key, found, err := s.loadVaultKeyCandidateLocked(previousVaultKeychainKey)
		if err != nil {
			return nil, false, nil, err
		}
		if !found {
			key, found, err = s.loadVaultKeyCandidateLocked(secondVaultKeychainKey)
			if err != nil {
				return nil, false, nil, err
			}
		}
		if !found {
			key, found, err = s.loadVaultKeyCandidateLocked(firstVaultKeychainKey)
			if err != nil {
				return nil, false, nil, err
			}
		}
		if !found {
			key, found, err = s.loadVaultKeyCandidateLocked(bundledVaultKeychainKey)
			if err != nil {
				return nil, false, nil, err
			}
		}
		if !found {
			return nil, false, nil, errors.New("existing vault has no matching vault key")
		}
		if err := s.saveVaultKeyLocked(vaultKeychainKey, key); err != nil {
			return nil, false, nil, err
		}
		return key, false, nil, nil
	}

	item, err = s.ring.Get(bundledVaultKeychainKey)
	if err == nil {
		key, err := decodeVaultKey(item.Data)
		if err == nil {
			if err := s.saveVaultKeyLocked(vaultKeychainKey, key); err != nil {
				return nil, false, nil, err
			}
			return key, false, nil, nil
		}
		legacy, ok := parseLegacySecretBundle(item.Data)
		if !ok {
			return nil, false, nil, err
		}
		key, err = newVaultKey()
		if err != nil {
			return nil, false, nil, err
		}
		if err := s.saveVaultKeyLocked(vaultKeychainKey, key); err != nil {
			return nil, false, nil, err
		}
		return key, true, &legacy, nil
	}
	if !errors.Is(err, keyring.ErrKeyNotFound) {
		return nil, false, nil, err
	}

	key, err := newVaultKey()
	if err != nil {
		return nil, false, nil, err
	}
	if err := s.saveVaultKeyLocked(vaultKeychainKey, key); err != nil {
		return nil, false, nil, err
	}
	return key, true, nil, nil
}

func newVaultKey() ([]byte, error) {
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, err
	}
	return key, nil
}

func (s *VaultSecretStore) loadVaultKeyCandidateLocked(keyName string) ([]byte, bool, error) {
	item, err := s.ring.Get(keyName)
	if err != nil {
		if errors.Is(err, keyring.ErrKeyNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	key, err := decodeVaultKey(item.Data)
	if err != nil {
		return nil, false, err
	}
	return key, true, nil
}

func (s *VaultSecretStore) saveVaultKeyLocked(keyName string, key []byte) error {
	item := keyring.Item{
		Key:         keyName,
		Data:        []byte(base64.StdEncoding.EncodeToString(key)),
		Label:       "DataPanel vault",
		Description: "Unlocks encrypted DataPanel database and AI credentials.",
	}
	return s.ring.Set(item)
}

func vaultFileExists(path string) bool {
	if _, err := os.Stat(path); err == nil {
		return true
	}
	return false
}

func (s *VaultSecretStore) loadVaultFileLocked() error {
	contents, err := os.ReadFile(s.vaultPath)
	if err != nil {
		return err
	}
	var envelope vaultEnvelope
	if err := json.Unmarshal(contents, &envelope); err != nil {
		return err
	}
	bundle, err := decryptVaultBundle(s.key, envelope)
	if err != nil {
		return err
	}
	s.bundle = bundle
	s.envelope = envelope
	return nil
}

func (s *VaultSecretStore) saveVaultLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.vaultPath), 0o700); err != nil {
		return err
	}
	envelope := s.envelope
	if envelope.Version == 0 {
		envelope.Version = vaultVersion
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if strings.TrimSpace(envelope.CreatedAt) == "" {
		envelope.CreatedAt = now
	}
	envelope.UpdatedAt = now
	nextEnvelope, err := encryptVaultBundle(s.key, s.bundle, envelope)
	if err != nil {
		return err
	}
	contents, err := json.MarshalIndent(nextEnvelope, "", "  ")
	if err != nil {
		return err
	}
	tempPath := s.vaultPath + ".tmp"
	if err := os.WriteFile(tempPath, append(contents, '\n'), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tempPath, s.vaultPath); err != nil {
		return err
	}
	s.envelope = nextEnvelope
	return nil
}

func (s *VaultSecretStore) markLegacyCheckedLocked(migrated bool) {
	now := time.Now().UTC().Format(time.RFC3339)
	s.envelope.MigratedFrom = "keychain-bundle-v1"
	s.envelope.MigratedAt = now
	if s.envelope.CreatedAt == "" {
		s.envelope.CreatedAt = now
	}
	if !migrated {
		s.envelope.MigratedFrom = "none"
	}
}

func decodeVaultKey(data []byte) ([]byte, error) {
	value := strings.TrimSpace(string(data))
	key, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, errors.New("vault key has invalid length")
	}
	return key, nil
}

func encryptVaultBundle(key []byte, bundle secretBundle, envelope vaultEnvelope) (vaultEnvelope, error) {
	bundle.ensure()
	block, err := aes.NewCipher(key)
	if err != nil {
		return vaultEnvelope{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return vaultEnvelope{}, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return vaultEnvelope{}, err
	}
	plaintext, err := json.Marshal(bundle)
	if err != nil {
		return vaultEnvelope{}, err
	}
	envelope.Version = vaultVersion
	envelope.Nonce = base64.StdEncoding.EncodeToString(nonce)
	envelope.Ciphertext = base64.StdEncoding.EncodeToString(gcm.Seal(nil, nonce, plaintext, vaultAAD(envelope)))
	return envelope, nil
}

func decryptVaultBundle(key []byte, envelope vaultEnvelope) (secretBundle, error) {
	if envelope.Version != vaultVersion {
		return secretBundle{}, errors.New("unsupported vault version")
	}
	nonce, err := base64.StdEncoding.DecodeString(envelope.Nonce)
	if err != nil {
		return secretBundle{}, err
	}
	ciphertext, err := base64.StdEncoding.DecodeString(envelope.Ciphertext)
	if err != nil {
		return secretBundle{}, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return secretBundle{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return secretBundle{}, err
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, vaultAAD(envelope))
	if err != nil {
		return secretBundle{}, err
	}
	return parseSecretBundle(plaintext), nil
}

func vaultAAD(envelope vaultEnvelope) []byte {
	return []byte(strings.Join([]string{
		"datapanel-vault",
		strings.TrimSpace(envelope.CreatedAt),
		strings.TrimSpace(envelope.MigratedFrom),
		strings.TrimSpace(envelope.MigratedAt),
	}, "\n"))
}

func bundleHasSecrets(bundle secretBundle) bool {
	bundle.ensure()
	return len(bundle.DBPasswords) > 0 || len(bundle.AICredentials) > 0
}

func mergeSecretBundles(current secretBundle, legacy secretBundle) secretBundle {
	current.ensure()
	legacy.ensure()
	for key, value := range legacy.DBPasswords {
		if _, exists := current.DBPasswords[key]; !exists {
			current.DBPasswords[key] = value
		}
	}
	for key, value := range legacy.AICredentials {
		if _, exists := current.AICredentials[key]; !exists {
			current.AICredentials[key] = value
		}
	}
	return current
}

func parseLegacySecretBundle(data []byte) (secretBundle, bool) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err == nil {
		if _, ok := raw["dbPasswords"]; ok {
			return parseSecretBundle(data), true
		}
		if _, ok := raw["aiCredentials"]; ok {
			return parseSecretBundle(data), true
		}
	}

	var flat map[string]string
	if err := json.Unmarshal(data, &flat); err == nil {
		return parseSecretBundle(data), true
	}
	return secretBundle{}, false
}
