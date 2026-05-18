package quotes

import (
	"testing"
	"time"
)

func TestDateKey_AsiaTaipeiCrossesUtcMidnight(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		nowUTC  string
		wantKey string
	}{
		{
			name:    "morning UTC = same day Taipei",
			nowUTC:  "2026-05-15T00:00:00Z", // 台北 08:00, 5/15
			wantKey: "260515",
		},
		{
			name:    "noon UTC = evening Taipei, same day",
			nowUTC:  "2026-05-15T12:00:00Z", // 台北 20:00, 5/15
			wantKey: "260515",
		},
		{
			name:    "late UTC = next morning Taipei (critical: rolls over)",
			nowUTC:  "2026-05-15T23:00:00Z", // 台北 07:00, 5/16
			wantKey: "260516",
		},
		{
			name:    "Taipei midnight: 16:00 UTC = 00:00 Taipei next day",
			nowUTC:  "2026-05-15T16:00:00Z", // 台北 00:00, 5/16
			wantKey: "260516",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			now, err := time.Parse(time.RFC3339, tc.nowUTC)
			if err != nil {
				t.Fatalf("parse %q: %v", tc.nowUTC, err)
			}
			if got := dateKey(now); got != tc.wantKey {
				t.Errorf("dateKey(%s) = %q, want %q (Asia/Taipei)", tc.nowUTC, got, tc.wantKey)
			}
		})
	}
}

func TestQuoteNo_Formats(t *testing.T) {
	t.Parallel()

	cases := []struct {
		key  string
		seq  int32
		want string
	}{
		{"260515", 1, "AW-260515-001"},
		{"260515", 10, "AW-260515-010"},
		{"260515", 999, "AW-260515-999"},
		{"260515", 1000, "AW-260515-1000"}, // spec 未明定 1000+；widens 不 truncate（避免重號）
	}
	for _, tc := range cases {
		t.Run(tc.want, func(t *testing.T) {
			t.Parallel()
			if got := quoteNo(tc.key, tc.seq); got != tc.want {
				t.Errorf("quoteNo(%q, %d) = %q, want %q", tc.key, tc.seq, got, tc.want)
			}
		})
	}
}

func TestTaipeiLocation_IsLoadedFromTzdata(t *testing.T) {
	// Sanity check: embedded tzdata works in test binary. Proves we didn't
	// silently fall through to FixedZone (which loses DST correctness in
	// general, though Taiwan has no DST so functionally equivalent here).
	if taipei.String() != "Asia/Taipei" {
		t.Errorf("taipei.String() = %q, want %q (got FixedZone fallback?)",
			taipei.String(), "Asia/Taipei")
	}
}
