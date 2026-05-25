// Package quotes implements quote-app persistence and business logic.
// This file isolates quote-number formatting so it can be tested without
// DB access. M5 adds the repo wrapper + HTTP handlers on top of sqlcgen.
package quotes

import (
	"fmt"
	"time"

	// Embed Go's tzdata so Asia/Taipei is always loadable, even in
	// distroless containers where /usr/share/zoneinfo is missing.
	_ "time/tzdata"
)

// taipei is loaded once at process start to avoid LoadLocation cost per call.
var taipei = mustTaipei()

func mustTaipei() *time.Location {
	loc, err := time.LoadLocation("Asia/Taipei")
	if err != nil {
		// Fallback: fixed UTC+8 zone. Should not happen with embedded
		// tzdata, but the fallback keeps NextNumber working even if the
		// build is misconfigured (loses DST correctness — Taiwan has none).
		return time.FixedZone("Asia/Taipei", 8*60*60)
	}
	return loc
}

// nowInTaipei returns the current instant with an explicit Asia/Taipei
// location, so callers do not leak Cloud Run's UTC default into serial-date
// allocation boundaries.
func nowInTaipei() time.Time {
	return time.Now().In(taipei)
}

// dateKey returns the YYMMDD string for `now` in Asia/Taipei timezone,
// per SPEC §3.1 (流水號每日歸零 = 台北日界線).
//
// Critical: Cloud Run defaults to UTC, but a quote created at 23:30 UTC
// (= 07:30 next day in Taipei) must roll the sequence over. Reviewer
// flagged this in PR #1 (Gemini MEDIUM, finding 3).
func dateKey(now time.Time) string {
	return now.In(taipei).Format("060102")
}

// quoteNo formats a date key + sequence into the canonical AW-YYMMDD-NNN.
// Sequence ≥1000 widens to 4+ digits (spec doesn't bound NNN; we don't
// truncate, which would create duplicate IDs).
func quoteNo(dateKey string, seq int32) string {
	return fmt.Sprintf("AW-%s-%03d", dateKey, seq)
}
