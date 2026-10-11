package app

import (
	"crypto/rand"
	"encoding/binary"
	"strings"
)

// Unit codes are 12 characters of Crockford base32 (60 random bits). They are printed on
// each pack's QR label, so they must be unguessable; they are not secret once printed,
// which is why verification also watches for the same code being scanned by many people.
const codeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const codeLength = 12

func newUnitCode() (string, error) {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	n := binary.BigEndian.Uint64(b[:])
	out := make([]byte, codeLength)
	for i := range out {
		out[i] = codeAlphabet[n&31]
		n >>= 5
	}
	return string(out), nil
}

// NormalizeCode accepts what a user might type or a scanner might read — a full verify URL,
// lowercase, dashes/spaces, or commonly confused letters — and returns the canonical code.
func NormalizeCode(input string) string {
	s := strings.TrimSpace(input)
	if i := strings.LastIndex(s, "/v/"); i >= 0 {
		s = s[i+3:]
	}
	if i := strings.IndexAny(s, "?#"); i >= 0 {
		s = s[:i]
	}
	var b strings.Builder
	for _, r := range strings.ToUpper(s) {
		switch {
		case r == 'O':
			b.WriteByte('0')
		case r == 'I' || r == 'L':
			b.WriteByte('1')
		case (r >= '0' && r <= '9') || (r >= 'A' && r <= 'Z'):
			b.WriteRune(r)
		}
	}
	return b.String()
}

func validCode(code string) bool {
	if len(code) != codeLength {
		return false
	}
	for _, r := range code {
		if !strings.ContainsRune(codeAlphabet, r) {
			return false
		}
	}
	return true
}

// FormatCode groups a code for display: ABCD-EFGH-JKMN.
func FormatCode(code string) string {
	if len(code) != codeLength {
		return code
	}
	return code[0:4] + "-" + code[4:8] + "-" + code[8:12]
}
