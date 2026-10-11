/// Pack-code helpers. They mirror the backend's NormalizeCode so that whatever a camera reads
/// (a full verify URL, lowercase, dashes, look-alike letters) becomes the canonical 12-char code.
library;

String normalizeCode(String input) {
  var s = input.trim();
  final i = s.lastIndexOf('/v/');
  if (i >= 0) s = s.substring(i + 3);
  s = s.split(RegExp(r'[?#]')).first.toUpperCase();
  final out = StringBuffer();
  for (final ch in s.split('')) {
    if (ch == 'O') {
      out.write('0');
    } else if (ch == 'I' || ch == 'L') {
      out.write('1');
    } else if (RegExp(r'[0-9A-Z]').hasMatch(ch)) {
      out.write(ch);
    }
  }
  return out.toString();
}

bool isValidCode(String code) => code.length == 12;

String formatCode(String code) {
  final c = normalizeCode(code);
  if (c.length != 12) return c;
  return '${c.substring(0, 4)}-${c.substring(4, 8)}-${c.substring(8)}';
}
