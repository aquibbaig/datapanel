package connections

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/99designs/keyring"
)

func TestVaultStoreCreatesEncryptedVaultAndRoundTripsSecrets(t *testing.T) {
	ring := newFakeKeyring()
	store := &VaultSecretStore{
		ring:      ring,
		vaultPath: filepath.Join(t.TempDir(), "secrets.vault.json"),
		bundle:    newSecretBundle(),
	}

	if err := store.RequestAccess(context.Background()); err != nil {
		t.Fatalf("RequestAccess: %v", err)
	}
	if err := store.Save(context.Background(), "profile-1", "db-password"); err != nil {
		t.Fatalf("Save db secret: %v", err)
	}
	if err := store.Save(context.Background(), "ai:openai", "openai-token"); err != nil {
		t.Fatalf("Save ai secret: %v", err)
	}

	got, err := store.Get(context.Background(), "profile-1")
	if err != nil {
		t.Fatalf("Get db secret: %v", err)
	}
	if got != "db-password" {
		t.Fatalf("expected db password, got %q", got)
	}
	got, err = store.Get(context.Background(), "ai:openai")
	if err != nil {
		t.Fatalf("Get ai secret: %v", err)
	}
	if got != "openai-token" {
		t.Fatalf("expected ai token, got %q", got)
	}
	contents := mustReadFile(t, store.vaultPath)
	for _, forbidden := range [][]byte{[]byte("db-password"), []byte("openai-token")} {
		if bytes.Contains(contents, forbidden) {
			t.Fatalf("vault file contained plaintext secret %q", forbidden)
		}
	}
	if ring.getCount[vaultKeychainKey] != 1 {
		t.Fatalf("expected one vault key read, got %d", ring.getCount[vaultKeychainKey])
	}
	if ring.getCount[previousVaultKeychainKey] != 0 {
		t.Fatalf("expected no previous vault key read, got %d", ring.getCount[previousVaultKeychainKey])
	}
	if ring.getCount[bundledVaultKeychainKey] != 1 {
		t.Fatalf("expected one bundled vault key miss, got %d", ring.getCount[bundledVaultKeychainKey])
	}
}

func TestVaultStoreMigratesLegacyBundleOnce(t *testing.T) {
	ring := newFakeKeyring()
	legacy := newSecretBundle()
	legacy.set("profile-1", "legacy-db-password")
	legacy.set("ai:anthropic", "legacy-ai-token")
	payload, err := marshalSecretBundle(legacy)
	if err != nil {
		t.Fatal(err)
	}
	ring.items[bundledVaultKeychainKey] = keyring.Item{Key: bundledVaultKeychainKey, Data: payload}

	store := &VaultSecretStore{
		ring:      ring,
		vaultPath: filepath.Join(t.TempDir(), "secrets.vault.json"),
		bundle:    newSecretBundle(),
	}
	if err := store.RequestAccess(context.Background()); err != nil {
		t.Fatalf("RequestAccess: %v", err)
	}
	got, err := store.Get(context.Background(), "profile-1")
	if err != nil {
		t.Fatalf("Get migrated db secret: %v", err)
	}
	if got != "legacy-db-password" {
		t.Fatalf("expected migrated db password, got %q", got)
	}
	got, err = store.Get(context.Background(), "ai:anthropic")
	if err != nil {
		t.Fatalf("Get migrated ai secret: %v", err)
	}
	if got != "legacy-ai-token" {
		t.Fatalf("expected migrated ai token, got %q", got)
	}

	legacyReads := ring.getCount[bundledSecretsKey]
	if legacyReads != 1 {
		t.Fatalf("expected one legacy bundle read during migration, got %d", legacyReads)
	}
	if ring.getCount[vaultKeychainKey] != 1 {
		t.Fatalf("expected one canonical vault key read, got %d", ring.getCount[vaultKeychainKey])
	}
	if ring.getCount[previousVaultKeychainKey] != 0 {
		t.Fatalf("expected fresh migration not to read previous vault key, got %d", ring.getCount[previousVaultKeychainKey])
	}
	if ring.getCount[secondVaultKeychainKey] != 0 {
		t.Fatalf("expected fresh migration not to read second vault key, got %d", ring.getCount[secondVaultKeychainKey])
	}
	if ring.getCount[bundledVaultKeychainKey] != 1 {
		t.Fatalf("expected one legacy bundle read during migration, got %d", ring.getCount[bundledVaultKeychainKey])
	}
	if _, err := decodeVaultKey(ring.items[vaultKeychainKey].Data); err != nil {
		t.Fatalf("expected canonical item to contain vault key: %v", err)
	}
	if _, err := store.Get(context.Background(), "profile-1"); err != nil {
		t.Fatalf("second get: %v", err)
	}
	if ring.getCount[bundledVaultKeychainKey] != legacyReads {
		t.Fatalf("expected no legacy reads after migration, got %d", ring.getCount[bundledVaultKeychainKey])
	}

	restarted := &VaultSecretStore{
		ring:      ring,
		vaultPath: store.vaultPath,
		bundle:    newSecretBundle(),
	}
	got, err = restarted.Get(context.Background(), "profile-1")
	if err != nil {
		t.Fatalf("Get migrated db secret after restart: %v", err)
	}
	if got != "legacy-db-password" {
		t.Fatalf("expected migrated db password after restart, got %q", got)
	}
	if ring.getCount[vaultKeychainKey] != 2 {
		t.Fatalf("expected restarted store to read canonical vault key once more, got %d", ring.getCount[vaultKeychainKey])
	}
	if ring.getCount[bundledVaultKeychainKey] != legacyReads {
		t.Fatalf("expected restarted store not to read legacy bundle, got %d", ring.getCount[bundledVaultKeychainKey])
	}
}

func TestVaultStorePromotesPreviousVaultKeyForExistingVault(t *testing.T) {
	ring := newFakeKeyring()
	key := bytes.Repeat([]byte{3}, 32)
	bundle := newSecretBundle()
	bundle.set("profile-1", "vault-db-password")
	envelope, err := encryptVaultBundle(key, bundle, vaultEnvelope{
		Version:      vaultVersion,
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
		MigratedFrom: "keychain-bundle-v1",
		MigratedAt:   time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	vaultPath := filepath.Join(t.TempDir(), "secrets.vault.json")
	writeVaultEnvelope(t, vaultPath, envelope)
	ring.items[previousVaultKeychainKey] = keyring.Item{
		Key:  previousVaultKeychainKey,
		Data: []byte(base64Key(key)),
	}

	store := &VaultSecretStore{
		ring:      ring,
		vaultPath: vaultPath,
		bundle:    newSecretBundle(),
	}
	got, err := store.Get(context.Background(), "profile-1")
	if err != nil {
		t.Fatalf("Get existing vault secret: %v", err)
	}
	if got != "vault-db-password" {
		t.Fatalf("expected existing vault password, got %q", got)
	}
	if ring.getCount[vaultKeychainKey] != 1 {
		t.Fatalf("expected one primary vault key read, got %d", ring.getCount[vaultKeychainKey])
	}
	if ring.getCount[previousVaultKeychainKey] != 1 {
		t.Fatalf("expected one previous vault key read, got %d", ring.getCount[previousVaultKeychainKey])
	}
	if _, err := decodeVaultKey(ring.items[vaultKeychainKey].Data); err != nil {
		t.Fatalf("expected primary keychain item to receive vault key: %v", err)
	}
}

func TestVaultStorePromotesSecondVaultKeyForExistingVault(t *testing.T) {
	ring := newFakeKeyring()
	key := bytes.Repeat([]byte{8}, 32)
	bundle := newSecretBundle()
	bundle.set("profile-1", "second-vault-db-password")
	envelope, err := encryptVaultBundle(key, bundle, vaultEnvelope{
		Version:      vaultVersion,
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
		MigratedFrom: "keychain-bundle-v1",
		MigratedAt:   time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	vaultPath := filepath.Join(t.TempDir(), "secrets.vault.json")
	writeVaultEnvelope(t, vaultPath, envelope)
	ring.items[secondVaultKeychainKey] = keyring.Item{
		Key:  secondVaultKeychainKey,
		Data: []byte(base64Key(key)),
	}

	store := &VaultSecretStore{
		ring:      ring,
		vaultPath: vaultPath,
		bundle:    newSecretBundle(),
	}
	got, err := store.Get(context.Background(), "profile-1")
	if err != nil {
		t.Fatalf("Get existing vault secret: %v", err)
	}
	if got != "second-vault-db-password" {
		t.Fatalf("expected second vault password, got %q", got)
	}
	if ring.getCount[vaultKeychainKey] != 1 {
		t.Fatalf("expected one canonical vault key read, got %d", ring.getCount[vaultKeychainKey])
	}
	if ring.getCount[previousVaultKeychainKey] != 1 {
		t.Fatalf("expected one previous vault key miss, got %d", ring.getCount[previousVaultKeychainKey])
	}
	if ring.getCount[secondVaultKeychainKey] != 1 {
		t.Fatalf("expected one second vault key read, got %d", ring.getCount[secondVaultKeychainKey])
	}
	if _, err := decodeVaultKey(ring.items[vaultKeychainKey].Data); err != nil {
		t.Fatalf("expected canonical keychain item to receive vault key: %v", err)
	}
}

func TestVaultStorePromotesBundledVaultKeyForExistingVault(t *testing.T) {
	ring := newFakeKeyring()
	key := bytes.Repeat([]byte{6}, 32)
	bundle := newSecretBundle()
	bundle.set("profile-1", "bundled-key-db-password")
	envelope, err := encryptVaultBundle(key, bundle, vaultEnvelope{
		Version:      vaultVersion,
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
		MigratedFrom: "keychain-bundle-v1",
		MigratedAt:   time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	vaultPath := filepath.Join(t.TempDir(), "secrets.vault.json")
	writeVaultEnvelope(t, vaultPath, envelope)
	ring.items[bundledVaultKeychainKey] = keyring.Item{
		Key:  bundledVaultKeychainKey,
		Data: []byte(base64Key(key)),
	}

	store := &VaultSecretStore{
		ring:      ring,
		vaultPath: vaultPath,
		bundle:    newSecretBundle(),
	}
	got, err := store.Get(context.Background(), "profile-1")
	if err != nil {
		t.Fatalf("Get existing vault secret: %v", err)
	}
	if got != "bundled-key-db-password" {
		t.Fatalf("expected bundled-key vault password, got %q", got)
	}
	if ring.getCount[vaultKeychainKey] != 1 {
		t.Fatalf("expected one canonical vault key read, got %d", ring.getCount[vaultKeychainKey])
	}
	if ring.getCount[previousVaultKeychainKey] != 1 {
		t.Fatalf("expected one previous vault key miss, got %d", ring.getCount[previousVaultKeychainKey])
	}
	if ring.getCount[secondVaultKeychainKey] != 1 {
		t.Fatalf("expected one second vault key miss, got %d", ring.getCount[secondVaultKeychainKey])
	}
	if ring.getCount[bundledVaultKeychainKey] != 1 {
		t.Fatalf("expected one bundled vault key read, got %d", ring.getCount[bundledVaultKeychainKey])
	}
	if _, err := decodeVaultKey(ring.items[vaultKeychainKey].Data); err != nil {
		t.Fatalf("expected canonical keychain item to receive vault key: %v", err)
	}
}

func TestVaultStorePrefersCanonicalVaultKey(t *testing.T) {
	ring := newFakeKeyring()
	key := bytes.Repeat([]byte{4}, 32)
	bundle := newSecretBundle()
	bundle.set("profile-1", "canonical-db-password")
	envelope, err := encryptVaultBundle(key, bundle, vaultEnvelope{
		Version:      vaultVersion,
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
		MigratedFrom: "keychain-bundle-v1",
		MigratedAt:   time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	vaultPath := filepath.Join(t.TempDir(), "secrets.vault.json")
	writeVaultEnvelope(t, vaultPath, envelope)
	ring.items[vaultKeychainKey] = keyring.Item{
		Key:  vaultKeychainKey,
		Data: []byte(base64Key(key)),
	}
	ring.items[previousVaultKeychainKey] = keyring.Item{
		Key:  previousVaultKeychainKey,
		Data: []byte(base64Key(bytes.Repeat([]byte{5}, 32))),
	}

	store := &VaultSecretStore{
		ring:      ring,
		vaultPath: vaultPath,
		bundle:    newSecretBundle(),
	}
	got, err := store.Get(context.Background(), "profile-1")
	if err != nil {
		t.Fatalf("Get existing vault secret: %v", err)
	}
	if got != "canonical-db-password" {
		t.Fatalf("expected canonical vault password, got %q", got)
	}
	if ring.getCount[vaultKeychainKey] != 1 {
		t.Fatalf("expected one primary vault key read, got %d", ring.getCount[vaultKeychainKey])
	}
	if ring.getCount[previousVaultKeychainKey] != 0 {
		t.Fatalf("expected previous vault key not to be read, got %d", ring.getCount[previousVaultKeychainKey])
	}
	if ring.getCount[secondVaultKeychainKey] != 0 {
		t.Fatalf("expected second vault key not to be read, got %d", ring.getCount[secondVaultKeychainKey])
	}
	if ring.getCount[bundledVaultKeychainKey] != 0 {
		t.Fatalf("expected bundled vault key not to be read, got %d", ring.getCount[bundledVaultKeychainKey])
	}
}

func TestVaultStoreBlocksAfterDeniedUnlock(t *testing.T) {
	ring := newFakeKeyring()
	ring.getErr = errors.New("user canceled")
	store := &VaultSecretStore{
		ring:      ring,
		vaultPath: filepath.Join(t.TempDir(), "secrets.vault.json"),
		bundle:    newSecretBundle(),
	}

	if _, err := store.Get(context.Background(), "profile-1"); err == nil {
		t.Fatal("expected blocked unlock error")
	}
	firstReads := ring.getCount[vaultKeychainKey]
	if _, err := store.Get(context.Background(), "profile-1"); err == nil {
		t.Fatal("expected blocked unlock error on second read")
	}
	if ring.getCount[vaultKeychainKey] != firstReads {
		t.Fatalf("expected blocked store not to retry keychain, got %d -> %d", firstReads, ring.getCount[vaultKeychainKey])
	}
}

func TestVaultEncryptionRejectsTampering(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	bundle := newSecretBundle()
	bundle.set("profile-1", "secret")
	envelope, err := encryptVaultBundle(key, bundle, vaultEnvelope{
		Version:   vaultVersion,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	envelope.Ciphertext = envelope.Ciphertext[:len(envelope.Ciphertext)-2] + "aa"
	if _, err := decryptVaultBundle(key, envelope); err == nil {
		t.Fatal("expected tampered vault to fail decryption")
	}
}

func marshalSecretBundle(bundle secretBundle) ([]byte, error) {
	bundle.ensure()
	return json.Marshal(bundle)
}

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return contents
}

func writeVaultEnvelope(t *testing.T, path string, envelope vaultEnvelope) {
	t.Helper()
	contents, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, contents, 0o600); err != nil {
		t.Fatal(err)
	}
}

func base64Key(key []byte) string {
	return base64.StdEncoding.EncodeToString(key)
}

type fakeKeyring struct {
	items    map[string]keyring.Item
	getCount map[string]int
	getErr   error
}

func newFakeKeyring() *fakeKeyring {
	return &fakeKeyring{
		items:    map[string]keyring.Item{},
		getCount: map[string]int{},
	}
}

func (r *fakeKeyring) Get(key string) (keyring.Item, error) {
	r.getCount[key]++
	if r.getErr != nil {
		return keyring.Item{}, r.getErr
	}
	item, ok := r.items[key]
	if !ok {
		return keyring.Item{}, keyring.ErrKeyNotFound
	}
	return item, nil
}

func (r *fakeKeyring) GetMetadata(key string) (keyring.Metadata, error) {
	item, ok := r.items[key]
	if !ok {
		return keyring.Metadata{}, keyring.ErrKeyNotFound
	}
	return keyring.Metadata{Item: &item}, nil
}

func (r *fakeKeyring) Set(item keyring.Item) error {
	r.items[item.Key] = item
	return nil
}

func (r *fakeKeyring) Remove(key string) error {
	delete(r.items, key)
	return nil
}

func (r *fakeKeyring) Keys() ([]string, error) {
	keys := make([]string, 0, len(r.items))
	for key := range r.items {
		keys = append(keys, key)
	}
	return keys, nil
}
