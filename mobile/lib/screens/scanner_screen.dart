import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../api/code.dart';
import '../theme.dart';
import 'result_screen.dart';

/// Full-screen camera that reads a MediTrack QR code and opens its result.
class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _handled = false;
  bool _torch = false;
  String? _hint;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue;
      if (raw == null) continue;
      final code = normalizeCode(raw);
      if (isValidCode(code)) {
        _handled = true;
        _controller.stop();
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => ResultScreen(code: code)),
        );
        return;
      }
      setState(() => _hint = "That QR code isn't a MediTrack pack code.");
    }
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error) => _CameraError(error: error),
          ),
          const IgnorePointer(
            child: CustomPaint(painter: _ScanWindowPainter()),
          ),
          // Top bar
          Positioned(
            top: top + 8,
            left: 12,
            right: 12,
            child: Row(
              children: [
                _RoundButton(
                  icon: Icons.close_rounded,
                  onTap: () => Navigator.of(context).pop(),
                ),
                const Spacer(),
                const Text(
                  'Scan the pack',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                _RoundButton(
                  icon: _torch
                      ? Icons.flashlight_on_rounded
                      : Icons.flashlight_off_rounded,
                  onTap: () {
                    _controller.toggleTorch();
                    setState(() => _torch = !_torch);
                  },
                ),
              ],
            ),
          ),
          // Hint
          Positioned(
            left: 24,
            right: 24,
            bottom: MediaQuery.of(context).padding.bottom + 40,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Row(
                children: [
                  Icon(
                    _hint == null
                        ? Icons.qr_code_2_rounded
                        : Icons.error_outline_rounded,
                    color: _hint == null
                        ? AppColors.mint
                        : const Color(0xFFFCA5A5),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _hint ??
                          'Fit the QR code inside the frame. It is usually on the side or back of the box.',
                      style: const TextStyle(color: Colors.white, height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.15),
      shape: const CircleBorder(),
      child: IconButton(
        icon: Icon(icon, color: Colors.white),
        onPressed: onTap,
      ),
    );
  }
}

/// Dims everything except a rounded square window, with teal corner brackets.
class _ScanWindowPainter extends CustomPainter {
  const _ScanWindowPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final side = size.width * 0.68;
    final rect = Rect.fromCenter(
      center: size.center(const Offset(0, -30)),
      width: side,
      height: side,
    );
    final window = RRect.fromRectAndRadius(rect, const Radius.circular(28));
    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(Offset.zero & size),
        Path()..addRRect(window),
      ),
      Paint()..color = Colors.black.withValues(alpha: 0.55),
    );
    final paint = Paint()
      ..color = AppColors.mint
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    const len = 34.0, r = 28.0;
    for (final (dx, dy) in [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)]) {
      final x = rect.left + dx * rect.width;
      final y = rect.top + dy * rect.height;
      final sx = dx == 0 ? 1.0 : -1.0;
      final sy = dy == 0 ? 1.0 : -1.0;
      final path = Path()
        ..moveTo(x, y + sy * (r + len))
        ..lineTo(x, y + sy * r)
        ..arcToPoint(
          Offset(x + sx * r, y),
          radius: const Radius.circular(r),
          clockwise: sx * sy > 0,
        )
        ..lineTo(x + sx * (r + len), y);
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.error});
  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.no_photography_outlined,
              color: Colors.white70,
              size: 52,
            ),
            const SizedBox(height: 16),
            Text(
              denied
                  ? 'MediTrack needs camera access to scan codes. Allow it in your phone settings, or go back and type the code.'
                  : "The camera couldn't start. Go back and type the code printed under the QR instead.",
              style: const TextStyle(color: Colors.white, height: 1.4),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 22),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: AppColors.ink,
              ),
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Type the code instead'),
            ),
          ],
        ),
      ),
    );
  }
}
