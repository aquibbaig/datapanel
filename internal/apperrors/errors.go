package apperrors

import "fmt"

type Code string

const (
	CodeValidation Code = "validation"
	CodeNotFound   Code = "not_found"
	CodeDatabase   Code = "database"
	CodeStorage    Code = "storage"
	CodeSecurity   Code = "security"
	CodeCanceled   Code = "canceled"
)

type Error struct {
	Code    Code   `json:"code"`
	Message string `json:"message"`
}

func (e Error) Error() string {
	if e.Message == "" {
		return string(e.Code)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func New(code Code, message string) Error {
	return Error{Code: code, Message: message}
}
