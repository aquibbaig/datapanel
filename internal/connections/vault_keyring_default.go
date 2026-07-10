//go:build !darwin || !cgo

package connections

import "github.com/99designs/keyring"

func newVaultKeyring(serviceName string) (keyring.Keyring, error) {
	return keyring.Open(keyring.Config{
		ServiceName: serviceName,
	})
}
