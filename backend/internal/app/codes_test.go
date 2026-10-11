package app

import "testing"

func TestNormalizeCode(t *testing.T) {
	cases := map[string]string{
		"ABCD-EFGH-JKMN":                        "ABCDEFGHJKMN",
		" abcd efgh jkmn ":                      "ABCDEFGHJKMN",
		"https://meditrack.et/v/ABCD-EFGH-JKMN": "ABCDEFGHJKMN",
		"https://x/v/ABCDEFGHJKMN?utm=1":        "ABCDEFGHJKMN",
		"O0Il":                                  "0011",
	}
	for in, want := range cases {
		if got := NormalizeCode(in); got != want {
			t.Errorf("NormalizeCode(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNewUnitCode(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 10000; i++ {
		c, err := newUnitCode()
		if err != nil {
			t.Fatal(err)
		}
		if !validCode(c) {
			t.Fatalf("invalid code %q", c)
		}
		if seen[c] {
			t.Fatalf("duplicate code %q", c)
		}
		seen[c] = true
	}
	if FormatCode("ABCDEFGHJKMN") != "ABCD-EFGH-JKMN" {
		t.Fatal("FormatCode")
	}
}
