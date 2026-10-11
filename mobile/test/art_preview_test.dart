import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:meditrack/widgets/medicine_art.dart';

// Renders every illustration to a PNG for visual review. Skipped unless ART_PREVIEW is set.
void main() {
  final out = Platform.environment['ART_PREVIEW'];
  testWidgets('medicine art preview', (tester) async {
    final key = GlobalKey();
    const items = [
      ('Tablet', 'Panadol'),
      ('Tablet', 'Brufen'),
      ('Capsule', 'Amoxil'),
      ('Syrup', 'Calpol'),
      ('Eye drops', 'Chloramphenicol'),
      ('Injection', 'Insulatard'),
      ('Cream', 'Fucidin'),
      ('Inhaler', 'Ventolin'),
      ('Sachet', 'ORS'),
      ('Bottle', 'Other'),
    ];
    tester.view.physicalSize = const Size(1000, 440);
    tester.view.devicePixelRatio = 1;
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: RepaintBoundary(
          key: key,
          child: Container(
            color: Colors.white,
            padding: const EdgeInsets.all(10),
            child: Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (final (f, n) in items)
                  SizedBox(
                    width: 186,
                    height: 200,
                    child: MedicineArt(dosageForm: f, seed: n),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final bytes = await tester.runAsync(() async {
      final image = await boundary.toImage(pixelRatio: 1);
      return (await image.toByteData(
        format: ui.ImageByteFormat.png,
      ))!.buffer.asUint8List();
    });
    File('$out/art.png').writeAsBytesSync(bytes!);
  }, skip: out == null);
}
