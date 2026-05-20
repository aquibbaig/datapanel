package query

import (
	"regexp"
	"strings"
)

var (
	dropPattern     = regexp.MustCompile(`(?i)\bdrop\s+(table|schema|database|view|materialized\s+view|index)\b`)
	truncatePattern = regexp.MustCompile(`(?i)\btruncate\b`)
	alterPattern    = regexp.MustCompile(`(?i)\balter\s+(table|schema|database|view|materialized\s+view|index)\b`)
)

func AnalyzeSQL(sql string) SQLAnalysis {
	normalized := stripComments(sql)
	warnings := []string{}

	if dropPattern.MatchString(normalized) {
		warnings = append(warnings, "This query contains DROP and can remove database objects.")
	}
	if truncatePattern.MatchString(normalized) {
		warnings = append(warnings, "This query contains TRUNCATE and can remove table data.")
	}
	if alterPattern.MatchString(normalized) {
		warnings = append(warnings, "This query contains ALTER and can change schema structure.")
	}
	for _, statement := range splitStatements(normalized) {
		lower := strings.ToLower(strings.TrimSpace(statement))
		if strings.HasPrefix(lower, "delete from ") && !strings.Contains(lower, " where ") {
			warnings = append(warnings, "This query contains DELETE without a WHERE clause.")
		}
		if strings.HasPrefix(lower, "update ") && strings.Contains(lower, " set ") && !strings.Contains(lower, " where ") {
			warnings = append(warnings, "This query contains UPDATE without a WHERE clause.")
		}
	}

	return SQLAnalysis{Destructive: len(warnings) > 0, Warnings: warnings}
}

func splitStatements(sql string) []string {
	parts := strings.Split(sql, ";")
	statements := make([]string, 0, len(parts))
	for _, part := range parts {
		statement := strings.TrimSpace(part)
		if statement != "" {
			statements = append(statements, statement)
		}
	}
	return statements
}

func stripComments(sql string) string {
	lines := strings.Split(sql, "\n")
	for index, line := range lines {
		if position := strings.Index(line, "--"); position >= 0 {
			lines[index] = line[:position]
		}
	}

	joined := strings.Join(lines, "\n")
	for {
		start := strings.Index(joined, "/*")
		if start < 0 {
			break
		}
		end := strings.Index(joined[start+2:], "*/")
		if end < 0 {
			joined = joined[:start]
			break
		}
		joined = joined[:start] + joined[start+2+end+2:]
	}
	return strings.TrimSpace(joined)
}
