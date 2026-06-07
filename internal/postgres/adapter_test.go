package postgres

import "testing"

func TestNormalizeRowFormatsUUIDBytes(t *testing.T) {
	row := normalizeRow([]any{
		[16]byte{75, 92, 147, 114, 145, 64, 70, 11, 167, 66, 102, 212, 7, 239, 116, 22},
	})

	if got, want := row[0], "4b5c9372-9140-460b-a742-66d407ef7416"; got != want {
		t.Fatalf("normalizeRow UUID = %v, want %s", got, want)
	}
}

func TestReturnsRows(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		want bool
	}{
		{
			name: "select",
			sql:  "select * from users",
			want: true,
		},
		{
			name: "commented select",
			sql:  "-- editor query\nselect * from users",
			want: true,
		},
		{
			name: "table editor transaction",
			sql:  "begin;\nupdate users set name = 'Ada' where id = '4b5c9372-9140-460b-a742-66d407ef7416';\ncommit;",
			want: false,
		},
		{
			name: "update returning",
			sql:  "update users set name = 'Ada' where id = 1 returning *",
			want: true,
		},
		{
			name: "update returning on new line",
			sql:  "update users set name = 'Ada' where id = 1\nreturning *",
			want: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := returnsRows(test.sql); got != test.want {
				t.Fatalf("returnsRows(%q) = %v, want %v", test.sql, got, test.want)
			}
		})
	}
}

func TestConnectionEndpointSplitsHostPort(t *testing.T) {
	host, port := connectionEndpoint("10.253.0.3:5432", 1234)
	if host != "10.253.0.3" {
		t.Fatalf("expected host without port, got %q", host)
	}
	if port != 5432 {
		t.Fatalf("expected parsed port, got %d", port)
	}
}

func TestConnectionEndpointNormalizesIPv6(t *testing.T) {
	host, port := connectionEndpoint("[::1]:5433", 5432)
	if host != "::1" {
		t.Fatalf("expected unbracketed IPv6 host, got %q", host)
	}
	if port != 5433 {
		t.Fatalf("expected parsed port, got %d", port)
	}
}
