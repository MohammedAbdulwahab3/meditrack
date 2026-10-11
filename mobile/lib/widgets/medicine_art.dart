import 'package:flutter/material.dart';

/// The broad kind of medicine, which decides which illustration is drawn.
enum MedicineForm {
  tablet,
  capsule,
  syrup,
  drops,
  injection,
  cream,
  inhaler,
  sachet,
  other,
}

MedicineForm medicineFormOf(String dosageForm) {
  final f = dosageForm.toLowerCase();
  bool has(List<String> words) => words.any(f.contains);
  if (has(['drop'])) return MedicineForm.drops;
  if (has(['capsule'])) return MedicineForm.capsule;
  if (has(['tablet', 'caplet', 'lozenge'])) return MedicineForm.tablet;
  if (has(['syrup', 'suspension', 'solution', 'liquid', 'elixir', 'mixture'])) {
    return MedicineForm.syrup;
  }
  if (has(['inject', 'vial', 'ampoule', 'ampule', 'infusion'])) {
    return MedicineForm.injection;
  }
  if (has(['cream', 'ointment', 'gel', 'lotion', 'paste'])) {
    return MedicineForm.cream;
  }
  if (has(['inhal', 'spray', 'aerosol', 'nebul'])) return MedicineForm.inhaler;
  if (has(['sachet', 'powder', 'granule'])) return MedicineForm.sachet;
  return MedicineForm.other;
}

String medicineFormLabel(MedicineForm f) => switch (f) {
  MedicineForm.tablet => 'Tablets',
  MedicineForm.capsule => 'Capsules',
  MedicineForm.syrup => 'Syrups',
  MedicineForm.drops => 'Drops',
  MedicineForm.injection => 'Injections',
  MedicineForm.cream => 'Creams',
  MedicineForm.inhaler => 'Inhalers',
  MedicineForm.sachet => 'Sachets',
  MedicineForm.other => 'Other',
};

class MedicinePalette {
  final Color bgTop, bgBottom, main, deep, light;
  const MedicinePalette(
    this.bgTop,
    this.bgBottom,
    this.main,
    this.deep,
    this.light,
  );
}

const _palettes = [
  MedicinePalette(
    Color(0xFFE3F5F1),
    Color(0xFFC9ECE4),
    Color(0xFF14B8A6),
    Color(0xFF0F766E),
    Color(0xFF99F6E4),
  ),
  MedicinePalette(
    Color(0xFFE8F1FF),
    Color(0xFFD2E3FF),
    Color(0xFF3B82F6),
    Color(0xFF1D4ED8),
    Color(0xFFBFDBFE),
  ),
  MedicinePalette(
    Color(0xFFFFEEE8),
    Color(0xFFFFDCD0),
    Color(0xFFF97362),
    Color(0xFFC2410C),
    Color(0xFFFECACA),
  ),
  MedicinePalette(
    Color(0xFFFFF5E0),
    Color(0xFFFFE7B8),
    Color(0xFFF59E0B),
    Color(0xFFB45309),
    Color(0xFFFDE68A),
  ),
  MedicinePalette(
    Color(0xFFF1ECFF),
    Color(0xFFE1D8FF),
    Color(0xFF8B5CF6),
    Color(0xFF6D28D9),
    Color(0xFFDDD6FE),
  ),
  MedicinePalette(
    Color(0xFFFFECF2),
    Color(0xFFFFD8E5),
    Color(0xFFEC4899),
    Color(0xFFBE185D),
    Color(0xFFFBCFE8),
  ),
  MedicinePalette(
    Color(0xFFE9F7EC),
    Color(0xFFD1F0D9),
    Color(0xFF22C55E),
    Color(0xFF15803D),
    Color(0xFFBBF7D0),
  ),
];

int _stableHash(String s) {
  var h = 7;
  for (final c in s.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return h;
}

/// The colours a medicine is drawn in; stable for the same [seed].
MedicinePalette medicinePalette(String seed) =>
    _palettes[_stableHash(seed) % _palettes.length];

/// A clean, drawn illustration of a medicine pack, chosen from its dosage form. Same seed,
/// same colours, so a medicine looks the same everywhere in the app.
class MedicineArt extends StatelessWidget {
  const MedicineArt({
    super.key,
    required this.dosageForm,
    required this.seed,
    this.borderRadius = 20,
  });

  final String dosageForm;
  final String seed;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final palette = medicinePalette(seed);
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [palette.bgTop, palette.bgBottom],
          ),
        ),
        child: CustomPaint(
          painter: _ArtPainter(
            medicineFormOf(dosageForm),
            palette,
            _stableHash(seed),
          ),
          child: const SizedBox.expand(),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Painting. Every illustration is drawn in a 100 × 100 design space and scaled to fit.

const _slate = Color(0xFF94A3B8);
const _slateLight = Color(0xFFCBD5E1);
const _paper = Color(0xFFF8FAFC);
const _paperShade = Color(0xFFE2E8F0);

class _ArtPainter extends CustomPainter {
  _ArtPainter(this.form, this.p, this.hash);
  final MedicineForm form;
  final MedicinePalette p;
  final int hash;

  @override
  void paint(Canvas canvas, Size size) {
    final m = size.shortestSide;
    // Soft decorative bubbles behind the object.
    final bubble = Paint()..color = Colors.white.withValues(alpha: 0.38);
    canvas.drawCircle(
      Offset(size.width * 0.88, size.height * 0.1),
      m * 0.3,
      bubble,
    );
    canvas.drawCircle(
      Offset(size.width * 0.08, size.height * 0.95),
      m * 0.2,
      bubble..color = Colors.white.withValues(alpha: 0.28),
    );

    final s = m * 0.84;
    canvas.save();
    canvas.translate((size.width - s) / 2, (size.height - s) / 2);
    canvas.scale(s / 100);
    switch (form) {
      case MedicineForm.tablet:
        _tablet(canvas);
      case MedicineForm.capsule:
        _capsules(canvas);
      case MedicineForm.syrup:
        _syrup(canvas);
      case MedicineForm.drops:
        _drops(canvas);
      case MedicineForm.injection:
        _injection(canvas);
      case MedicineForm.cream:
        _cream(canvas);
      case MedicineForm.inhaler:
        _inhaler(canvas);
      case MedicineForm.sachet:
        _sachets(canvas);
      case MedicineForm.other:
        _bottle(canvas);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_ArtPainter old) =>
      old.form != form || old.p != p || old.hash != hash;

  // ---- helpers ----

  static void _shadow(
    Canvas c,
    Path path, {
    double blur = 3.5,
    Offset offset = const Offset(0, 3),
    double alpha = 0.16,
  }) {
    c.drawPath(
      path.shift(offset),
      Paint()
        ..color = const Color(0xFF0F172A).withValues(alpha: alpha)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, blur),
    );
  }

  static Paint _grad(
    Rect r,
    List<Color> colors, {
    Alignment begin = Alignment.topLeft,
    Alignment end = Alignment.bottomRight,
  }) => Paint()
    ..shader = LinearGradient(
      colors: colors,
      begin: begin,
      end: end,
    ).createShader(r);

  static Paint _stroke(Color color, double width) => Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = width
    ..strokeCap = StrokeCap.round
    ..color = color;

  static RRect _rr(double l, double t, double r, double b, double radius) =>
      RRect.fromLTRBR(l, t, r, b, Radius.circular(radius));

  static void _plus(Canvas c, Offset at, double size, Color color) {
    final w = size * 0.34;
    c.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: at, width: w, height: size),
        Radius.circular(w * 0.3),
      ),
      Paint()..color = color,
    );
    c.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: at, width: size, height: w),
        Radius.circular(w * 0.3),
      ),
      Paint()..color = color,
    );
  }

  /// A round tablet or an oblong caplet, with a score line and a highlight.
  void _pill(Canvas c, Offset at, double r, {bool oblong = false}) {
    final rect = oblong
        ? Rect.fromCenter(center: at, width: r * 2.3, height: r * 1.25)
        : Rect.fromCircle(center: at, radius: r);
    final shape = RRect.fromRectAndRadius(
      rect,
      Radius.circular(rect.shortestSide / 2),
    );
    _shadow(c, Path()..addRRect(shape), blur: 2, offset: const Offset(0, 1.6));
    c.drawRRect(
      shape,
      _grad(rect, [Color.lerp(p.light, Colors.white, .2)!, p.main]),
    );
    c.drawRRect(
      shape.deflate(r * 0.16),
      _stroke(Colors.white.withValues(alpha: 0.35), r * 0.1),
    );
    c.drawLine(
      at + Offset(0, -rect.height * 0.32),
      at + Offset(0, rect.height * 0.32),
      _stroke(p.deep.withValues(alpha: 0.35), r * 0.12),
    );
    c.drawCircle(
      at + Offset(-rect.width * 0.22, -rect.height * 0.22),
      r * 0.16,
      Paint()..color = Colors.white.withValues(alpha: 0.75),
    );
  }

  // ---- forms ----

  void _tablet(Canvas c) {
    final oblong = hash.isOdd;
    c.save();
    c.translate(44, 46);
    c.rotate(-0.22);
    final card = _rr(-25, -33, 25, 33, 8);
    _shadow(c, Path()..addRRect(card), blur: 4, offset: const Offset(1, 4));
    c.drawRRect(card, _grad(card.outerRect, [Colors.white, _paperShade]));
    c.drawRRect(card, _stroke(_slateLight, 0.8));
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 2; col++) {
        final at = Offset(col == 0 ? -11.5 : 11.5, (row - 1) * 20.0);
        final pocket = oblong
            ? RRect.fromRectAndRadius(
                Rect.fromCenter(center: at, width: 19, height: 12),
                const Radius.circular(6),
              )
            : RRect.fromRectAndRadius(
                Rect.fromCircle(center: at, radius: 8.5),
                const Radius.circular(8.5),
              );
        c.drawRRect(pocket, Paint()..color = _paper);
        c.drawRRect(pocket, _stroke(_slateLight, 0.7));
        if (!(row == 2 && col == 1)) _pill(c, at, 6.6, oblong: oblong);
      }
    }
    c.restore();
    _pill(c, const Offset(76, 76), 11, oblong: oblong);
  }

  void _capsuleShape(
    Canvas c,
    Offset at,
    double len,
    double thick,
    double angle,
  ) {
    c.save();
    c.translate(at.dx, at.dy);
    c.rotate(angle);
    final full = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset.zero, width: len, height: thick),
      Radius.circular(thick / 2),
    );
    _shadow(c, Path()..addRRect(full), blur: 3, offset: const Offset(0, 3));
    final bounds = full.outerRect;
    c.save();
    c.clipRect(Rect.fromLTRB(-len, -thick, 0.6, thick));
    c.drawRRect(
      full,
      _grad(
        bounds,
        [Color.lerp(p.main, Colors.white, .25)!, p.main, p.deep],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ),
    );
    c.restore();
    c.save();
    c.clipRect(Rect.fromLTRB(0.6, -thick, len, thick));
    c.drawRRect(
      full,
      _grad(
        bounds,
        [Colors.white, _paper, _slateLight],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ),
    );
    c.restore();
    c.drawLine(
      Offset(0.6, -thick / 2 + 1),
      Offset(0.6, thick / 2 - 1),
      _stroke(p.deep.withValues(alpha: 0.35), 0.9),
    );
    c.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(-len * 0.36, -thick * 0.32, len * 0.36, -thick * 0.16),
        Radius.circular(thick * 0.1),
      ),
      Paint()..color = Colors.white.withValues(alpha: 0.6),
    );
    c.restore();
  }

  void _capsules(Canvas c) {
    _capsuleShape(c, const Offset(44, 40), 62, 23, -0.62);
    _capsuleShape(c, const Offset(60, 68), 54, 20, 0.28);
  }

  void _syrup(Canvas c) {
    // Measuring cup behind-right.
    final cup = Path()
      ..moveTo(62, 64)
      ..lineTo(86, 64)
      ..lineTo(83, 90)
      ..quadraticBezierTo(82.5, 92, 80, 92)
      ..lineTo(68, 92)
      ..quadraticBezierTo(65.5, 92, 65, 90)
      ..close();
    _shadow(c, cup);
    c.save();
    c.clipPath(cup);
    c.drawPath(cup, Paint()..color = Colors.white.withValues(alpha: 0.9));
    c.drawRect(
      const Rect.fromLTRB(60, 76, 90, 94),
      _grad(const Rect.fromLTRB(60, 76, 90, 94), [p.main, p.deep]),
    );
    c.restore();
    c.drawPath(cup, _stroke(_slate, 0.9));
    for (final y in [70.0, 75.0, 80.0]) {
      c.drawLine(Offset(79, y), Offset(83, y), _stroke(_slate, 0.8));
    }

    // Amber bottle.
    const glass = [Color(0xFFE59A3A), Color(0xFFB45309), Color(0xFF7C2D12)];
    final neck = _rr(31, 18, 47, 34, 3);
    final body = Path()
      ..moveTo(31, 30)
      ..lineTo(47, 30)
      ..cubicTo(56, 32, 60, 36, 60, 44)
      ..lineTo(60, 86)
      ..quadraticBezierTo(60, 92, 54, 92)
      ..lineTo(24, 92)
      ..quadraticBezierTo(18, 92, 18, 86)
      ..lineTo(18, 44)
      ..cubicTo(18, 36, 22, 32, 31, 30)
      ..close();
    final whole = Path.combine(
      PathOperation.union,
      Path()..addRRect(neck),
      body,
    );
    _shadow(c, whole, blur: 4, offset: const Offset(1, 4));
    c.drawPath(
      whole,
      _grad(
        const Rect.fromLTRB(18, 18, 60, 92),
        glass,
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
      ),
    );
    c.drawRRect(
      _rr(22, 42, 26, 86, 2),
      Paint()..color = Colors.white.withValues(alpha: 0.28),
    );
    // Cap.
    final cap = _rr(28.5, 8, 49.5, 21, 3);
    c.drawRRect(
      cap,
      _grad(cap.outerRect, [Color.lerp(p.main, Colors.white, .2)!, p.deep]),
    );
    for (var x = 32.0; x <= 46; x += 3.5) {
      c.drawLine(
        Offset(x, 10.5),
        Offset(x, 18.5),
        _stroke(Colors.white.withValues(alpha: 0.28), 0.9),
      );
    }
    // Label.
    final label = _rr(22, 52, 56, 80, 4);
    c.drawRRect(label, Paint()..color = Colors.white);
    c.save();
    c.clipRRect(label);
    c.drawRect(const Rect.fromLTRB(22, 52, 56, 58), Paint()..color = p.main);
    c.restore();
    _plus(c, const Offset(39, 68.5), 10, p.main);
  }

  Path _drop(Offset at, double r) => Path()
    ..moveTo(at.dx, at.dy - 1.8 * r)
    ..cubicTo(
      at.dx + 0.3 * r,
      at.dy - 1.1 * r,
      at.dx + r,
      at.dy - 0.5 * r,
      at.dx + r,
      at.dy + 0.15 * r,
    )
    ..arcToPoint(
      Offset(at.dx - r, at.dy + 0.15 * r),
      radius: Radius.circular(r),
    )
    ..cubicTo(
      at.dx - r,
      at.dy - 0.5 * r,
      at.dx - 0.3 * r,
      at.dy - 1.1 * r,
      at.dx,
      at.dy - 1.8 * r,
    )
    ..close();

  void _drops(Canvas c) {
    final tip = Path()
      ..moveTo(33, 38)
      ..lineTo(38.5, 15)
      ..quadraticBezierTo(41, 9, 43.5, 15)
      ..lineTo(49, 38)
      ..close();
    final body = _rr(22, 44, 60, 92, 9);
    _shadow(c, Path()..addRRect(body), blur: 4, offset: const Offset(1, 4));
    c.drawPath(
      tip,
      _grad(
        const Rect.fromLTRB(33, 9, 49, 38),
        [Colors.white, _slateLight],
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
      ),
    );
    c.drawPath(tip, _stroke(_slateLight, 0.7));
    final collar = _rr(28, 34, 54, 46, 2.5);
    c.drawRRect(collar, _grad(collar.outerRect, [p.main, p.deep]));
    c.drawRRect(
      body,
      _grad(
        body.outerRect,
        [Colors.white, _paper, _paperShade],
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
      ),
    );
    c.drawRRect(body, _stroke(_slateLight, 0.6));
    final label = _rr(22, 58, 60, 80, 0);
    c.save();
    c.clipRRect(body);
    c.drawRRect(label, _grad(label.outerRect, [p.main, p.deep]));
    c.restore();
    _plus(c, const Offset(41, 69), 9, Colors.white);
    c.drawRRect(
      _rr(26, 48, 29.5, 88, 2),
      Paint()..color = Colors.white.withValues(alpha: 0.8),
    );
    // Falling drops.
    for (final (at, r) in [
      (const Offset(74, 30), 6.0),
      (const Offset(80, 52), 4.6),
      (const Offset(73, 70), 3.6),
    ]) {
      final d = _drop(at, r);
      _shadow(c, d, blur: 1.6, offset: const Offset(0, 1.4), alpha: 0.12);
      c.drawPath(
        d,
        _grad(d.getBounds(), [Color.lerp(p.main, Colors.white, .25)!, p.deep]),
      );
      c.drawCircle(
        at + Offset(-r * 0.35, -r * 0.1),
        r * 0.22,
        Paint()..color = Colors.white.withValues(alpha: 0.8),
      );
    }
  }

  void _injection(Canvas c) {
    // Vial.
    final vial = _rr(14, 40, 40, 90, 6);
    _shadow(c, Path()..addRRect(vial), blur: 4, offset: const Offset(1, 4));
    c.drawRRect(_rr(19, 30, 35, 42, 2), Paint()..color = _paperShade);
    c.drawRRect(vial, Paint()..color = Colors.white.withValues(alpha: 0.85));
    final liquid = _rr(15.5, 58, 38.5, 88.5, 5);
    c.drawRRect(
      liquid,
      _grad(
        liquid.outerRect,
        [p.light, p.main],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ),
    );
    c.drawRRect(vial, _stroke(_slateLight, 0.9));
    final metal = _rr(16, 21, 38, 33, 3);
    c.drawRRect(
      metal,
      _grad(
        metal.outerRect,
        [_paper, _slateLight, _slate],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ),
    );
    c.drawRRect(_rr(20, 16, 34, 22, 2), Paint()..color = p.deep);
    final band = _rr(14, 64, 40, 76, 0);
    c.drawRect(
      band.outerRect,
      Paint()..color = Colors.white.withValues(alpha: 0.92),
    );
    c.drawLine(
      const Offset(18, 70),
      const Offset(36, 70),
      _stroke(p.main, 1.6),
    );
    c.drawRRect(
      _rr(18, 44, 21, 86, 1.5),
      Paint()..color = Colors.white.withValues(alpha: 0.9),
    );

    // Syringe, diagonally in front.
    c.save();
    c.translate(70, 52);
    c.rotate(-1.0);
    final barrel = _rr(-22, -7, 15, 7, 2.5);
    _shadow(c, Path()..addRRect(barrel), blur: 3, offset: const Offset(2, 3));
    c.drawRRect(_rr(-40, -2.2, -21, 2.2, 1), Paint()..color = _slateLight);
    c.drawRRect(
      _rr(-43, -9, -38.5, 9, 1.6),
      _grad(const Rect.fromLTRB(-43, -9, -38.5, 9), [p.main, p.deep]),
    );
    c.drawRRect(barrel, Paint()..color = Colors.white.withValues(alpha: 0.92));
    c.drawRRect(
      _rr(-4, -5.6, 13.6, 5.6, 1.6),
      Paint()..color = p.main.withValues(alpha: 0.55),
    );
    c.drawRRect(_rr(-6, -6.4, -3, 6.4, 1), Paint()..color = p.deep);
    c.drawRRect(barrel, _stroke(_slate, 0.9));
    for (var x = -18.0; x <= 11; x += 4) {
      c.drawLine(Offset(x, -7), Offset(x, -3.4), _stroke(_slate, 0.7));
    }
    c.drawRRect(_rr(-25, -12, -21.5, 12, 1.4), Paint()..color = _slateLight);
    c.drawRRect(_rr(15, -3.4, 20.5, 3.4, 1), Paint()..color = _slate);
    c.drawLine(const Offset(20, 0), const Offset(38, 0), _stroke(_slate, 1.3));
    c.restore();
  }

  void _cream(Canvas c) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.5);
    final body = Path()
      ..moveTo(-32, -18)
      ..lineTo(15, -13.5)
      ..quadraticBezierTo(24, -12.5, 24, -6)
      ..lineTo(24, 6)
      ..quadraticBezierTo(24, 12.5, 15, 13.5)
      ..lineTo(-32, 18)
      ..close();
    _shadow(c, body, blur: 4, offset: const Offset(2, 4));
    c.drawPath(
      body,
      _grad(
        const Rect.fromLTRB(-32, -18, 24, 18),
        [Colors.white, _paper, _paperShade],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ),
    );
    // Label band.
    c.save();
    c.clipPath(body);
    c.drawRect(
      const Rect.fromLTRB(-20, -20, 6, 20),
      _grad(
        const Rect.fromLTRB(-20, -20, 6, 20),
        [p.main, p.deep],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ),
    );
    c.drawRect(const Rect.fromLTRB(9, -20, 11.5, 20), Paint()..color = p.main);
    c.drawRect(
      const Rect.fromLTRB(-34, -14, 24, -10.5),
      Paint()..color = Colors.white.withValues(alpha: 0.35),
    );
    c.restore();
    _plus(c, const Offset(-7, 0), 10, Colors.white);
    // Crimped end.
    final crimp = _rr(-37, -19.5, -29, 19.5, 1.5);
    c.drawRRect(crimp, _grad(crimp.outerRect, [_paper, _slateLight]));
    for (var x = -35.0; x <= -31; x += 2) {
      c.drawLine(
        Offset(x, -18),
        Offset(x, 18),
        _stroke(_slate.withValues(alpha: 0.6), 0.6),
      );
    }
    // Cap.
    final cap = _rr(24, -9, 38, 9, 2.5);
    c.drawRRect(
      cap,
      _grad(
        cap.outerRect,
        [Color.lerp(p.main, Colors.white, .2)!, p.deep],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ),
    );
    for (var x = 27.0; x <= 35; x += 2.6) {
      c.drawLine(
        Offset(x, -7),
        Offset(x, 7),
        _stroke(Colors.white.withValues(alpha: 0.3), 0.8),
      );
    }
    c.restore();
  }

  void _inhaler(Canvas c) {
    // Canister.
    final can = _rr(33, 10, 55, 46, 5);
    c.drawRRect(
      can,
      _grad(
        can.outerRect,
        [_slateLight, _paper, _slate],
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
      ),
    );
    c.drawRRect(_rr(32, 8, 56, 14, 3), Paint()..color = _slate);
    // Actuator boot.
    final boot = Path.combine(
      PathOperation.union,
      Path()..addRRect(_rr(28, 32, 60, 88, 10)),
      Path()..addRRect(_rr(42, 66, 84, 88, 9)),
    );
    _shadow(c, boot, blur: 4, offset: const Offset(1, 4));
    c.drawPath(
      boot,
      _grad(const Rect.fromLTRB(28, 32, 84, 88), [
        Color.lerp(p.main, Colors.white, .15)!,
        p.deep,
      ]),
    );
    c.drawRRect(
      _rr(32, 38, 36, 80, 2),
      Paint()..color = Colors.white.withValues(alpha: 0.3),
    );
    c.drawRRect(
      _rr(78, 70, 83, 84, 2.5),
      Paint()..color = p.deep.withValues(alpha: 0.9),
    );
    c.drawRRect(
      _rr(28, 32, 60, 37, 2.5),
      Paint()..color = p.deep.withValues(alpha: 0.35),
    );
    // Puff.
    for (final (at, r) in [
      (const Offset(90, 70), 3.6),
      (const Offset(94, 62), 2.8),
      (const Offset(89, 57), 2.0),
    ]) {
      c.drawCircle(
        at,
        r,
        Paint()..color = Colors.white.withValues(alpha: 0.85),
      );
    }
  }

  void _sachetShape(Canvas c, Offset at, double angle, {bool back = false}) {
    c.save();
    c.translate(at.dx, at.dy);
    c.rotate(angle);
    const w = 22.0, h = 31.0, tooth = 2.4;
    final path = Path()..moveTo(-w, -h + tooth);
    for (var x = -w; x < w - 0.1; x += 4) {
      path
        ..lineTo(x + 2, -h)
        ..lineTo(x + 4, -h + tooth);
    }
    path.lineTo(w, h - tooth);
    for (var x = w; x > -w + 0.1; x -= 4) {
      path
        ..lineTo(x - 2, h)
        ..lineTo(x - 4, h - tooth);
    }
    path.close();
    _shadow(c, path, blur: 3.5, offset: const Offset(1, 3.5));
    final colors = back
        ? [p.light, Color.lerp(p.light, p.main, .5)!]
        : [Color.lerp(p.main, Colors.white, .1)!, p.deep];
    c.drawPath(path, _grad(const Rect.fromLTRB(-w, -h, w, h), colors));
    c.save();
    c.clipPath(path);
    for (final y in [-h, h - 6]) {
      c.drawRect(
        Rect.fromLTRB(-w, y, w, y + 6),
        Paint()..color = Colors.white.withValues(alpha: 0.18),
      );
    }
    c.drawRect(
      const Rect.fromLTRB(-w + 3, -h + 8, -w + 6, h - 8),
      Paint()..color = Colors.white.withValues(alpha: 0.2),
    );
    c.restore();
    if (!back) {
      c.drawCircle(const Offset(0, 2), 11.5, Paint()..color = Colors.white);
      _plus(c, const Offset(0, 2), 11, p.main);
    }
    c.restore();
  }

  void _sachets(Canvas c) {
    _sachetShape(c, const Offset(60, 44), 0.24, back: true);
    _sachetShape(c, const Offset(42, 56), -0.12);
  }

  void _bottle(Canvas c) {
    final body = _rr(26, 34, 66, 90, 9);
    _shadow(c, Path()..addRRect(body), blur: 4, offset: const Offset(1, 4));
    c.drawRRect(
      body,
      _grad(
        body.outerRect,
        [Colors.white, _paper, _paperShade],
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
      ),
    );
    final cap = _rr(23, 16, 69, 36, 5);
    c.drawRRect(
      cap,
      _grad(
        cap.outerRect,
        [Color.lerp(p.main, Colors.white, .15)!, p.deep],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ),
    );
    for (var x = 28.0; x <= 64; x += 4) {
      c.drawLine(
        Offset(x, 19),
        Offset(x, 33),
        _stroke(Colors.white.withValues(alpha: 0.25), 1),
      );
    }
    final label = _rr(26, 50, 66, 76, 0);
    c.drawRect(label.outerRect, Paint()..color = p.light);
    _plus(c, const Offset(46, 63), 12, p.deep);
    _pill(c, const Offset(80, 82), 9);
  }
}
