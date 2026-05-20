package query

import "testing"

func TestAnalyzeSQLFlagsDestructiveStatements(t *testing.T) {
	tests := []struct {
		name string
		sql  string
	}{
		{name: "drop table", sql: "drop table users"},
		{name: "truncate", sql: "truncate table events"},
		{name: "alter", sql: "alter table users add column deleted_at timestamptz"},
		{name: "delete without where", sql: "delete from users;"},
		{name: "update without where", sql: "update users set admin = true;"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			analysis := AnalyzeSQL(test.sql)
			if !analysis.Destructive {
				t.Fatalf("expected destructive SQL for %q", test.sql)
			}
			if len(analysis.Warnings) == 0 {
				t.Fatalf("expected warnings for %q", test.sql)
			}
		})
	}
}

func TestAnalyzeSQLAllowsScopedWrites(t *testing.T) {
	tests := []string{
		"select * from users limit 10",
		"delete from users where id = $1",
		"update users set name = 'Ada' where id = $1",
		"-- drop table users\nselect 1",
	}

	for _, sql := range tests {
		analysis := AnalyzeSQL(sql)
		if analysis.Destructive {
			t.Fatalf("expected non-destructive SQL for %q, got %#v", sql, analysis.Warnings)
		}
	}
}
