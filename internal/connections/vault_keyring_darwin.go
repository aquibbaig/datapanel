//go:build darwin && cgo

package connections

import (
	gokeychain "github.com/99designs/go-keychain"
	"github.com/99designs/keyring"
)

type darwinVaultKeyring struct {
	service string
}

func newVaultKeyring(serviceName string) (keyring.Keyring, error) {
	return &darwinVaultKeyring{service: serviceName}, nil
}

func (r *darwinVaultKeyring) Get(key string) (keyring.Item, error) {
	query := r.queryItem(key)
	query.SetReturnAttributes(true)
	query.SetReturnData(true)

	results, err := gokeychain.QueryItem(query)
	if err != nil {
		return keyring.Item{}, err
	}
	if len(results) == 0 {
		return keyring.Item{}, keyring.ErrKeyNotFound
	}
	return keyring.Item{
		Key:         key,
		Data:        results[0].Data,
		Label:       results[0].Label,
		Description: results[0].Description,
	}, nil
}

func (r *darwinVaultKeyring) GetMetadata(key string) (keyring.Metadata, error) {
	query := r.queryItem(key)
	query.SetReturnAttributes(true)
	query.SetReturnData(false)

	results, err := gokeychain.QueryItem(query)
	if err != nil {
		return keyring.Metadata{}, err
	}
	if len(results) == 0 {
		return keyring.Metadata{}, keyring.ErrKeyNotFound
	}
	return keyring.Metadata{
		Item: &keyring.Item{
			Key:         key,
			Label:       results[0].Label,
			Description: results[0].Description,
		},
		ModificationTime: results[0].ModificationDate,
	}, nil
}

func (r *darwinVaultKeyring) Set(item keyring.Item) error {
	kcItem := r.baseItem(item.Key)
	kcItem.SetLabel(item.Label)
	kcItem.SetDescription(item.Description)
	kcItem.SetData(item.Data)

	if err := gokeychain.AddItem(kcItem); err == nil {
		return nil
	} else if err != gokeychain.ErrorDuplicateItem {
		return err
	}

	update := gokeychain.NewItem()
	update.SetLabel(item.Label)
	update.SetDescription(item.Description)
	update.SetData(item.Data)
	return gokeychain.UpdateItem(r.queryItem(item.Key), update)
}

func (r *darwinVaultKeyring) Remove(key string) error {
	if err := gokeychain.DeleteItem(r.queryItem(key)); err != nil {
		if err == gokeychain.ErrorItemNotFound {
			return keyring.ErrKeyNotFound
		}
		return err
	}
	return nil
}

func (r *darwinVaultKeyring) Keys() ([]string, error) {
	query := gokeychain.NewItem()
	query.SetSecClass(gokeychain.SecClassGenericPassword)
	query.SetService(r.service)
	query.SetMatchLimit(gokeychain.MatchLimitAll)
	query.SetReturnAttributes(true)

	results, err := gokeychain.QueryItem(query)
	if err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(results))
	for _, result := range results {
		keys = append(keys, result.Account)
	}
	return keys, nil
}

func (r *darwinVaultKeyring) queryItem(key string) gokeychain.Item {
	item := r.baseItem(key)
	item.SetMatchLimit(gokeychain.MatchLimitOne)
	return item
}

func (r *darwinVaultKeyring) baseItem(key string) gokeychain.Item {
	item := gokeychain.NewItem()
	item.SetSecClass(gokeychain.SecClassGenericPassword)
	item.SetService(r.service)
	item.SetAccount(key)
	return item
}

var _ keyring.Keyring = (*darwinVaultKeyring)(nil)
