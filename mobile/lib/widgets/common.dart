import 'package:flutter/material.dart';

import '../theme.dart';

export '../theme.dart' show AppColors, AppShadows;

const brand = AppColors.brand;

// ---------------------------------------------------------------------------
// Verification status styling
// ---------------------------------------------------------------------------

class StatusLook {
  final Color background, foreground, accent;
  final IconData icon;
  final String label;
  const StatusLook(
    this.background,
    this.foreground,
    this.accent,
    this.icon,
    this.label,
  );

  static StatusLook of(String status) => switch (status) {
    'genuine' => const StatusLook(
      AppColors.successSoft,
      Color(0xFF064E3B),
      AppColors.success,
      Icons.verified_rounded,
      'Genuine',
    ),
    'warning' => const StatusLook(
      AppColors.warningSoft,
      Color(0xFF78350F),
      AppColors.warning,
      Icons.warning_amber_rounded,
      'Check carefully',
    ),
    'expired' => const StatusLook(
      AppColors.dangerSoft,
      Color(0xFF881337),
      AppColors.danger,
      Icons.event_busy_rounded,
      'Expired',
    ),
    'recalled' => const StatusLook(
      AppColors.dangerSoft,
      Color(0xFF881337),
      AppColors.danger,
      Icons.block_rounded,
      'Recalled',
    ),
    'suspended' => const StatusLook(
      AppColors.dangerSoft,
      Color(0xFF881337),
      AppColors.danger,
      Icons.block_rounded,
      'Suspended',
    ),
    _ => const StatusLook(
      AppColors.dangerSoft,
      Color(0xFF881337),
      AppColors.danger,
      Icons.gpp_bad_rounded,
      'Not registered',
    ),
  };
}

/// Small rounded label with a coloured dot or icon.
class Pill extends StatelessWidget {
  const Pill(
    this.label, {
    super.key,
    required this.color,
    this.background,
    this.icon,
  });
  final String label;
  final Color color;
  final Color? background;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: background ?? color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: color,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final look = StatusLook.of(status);
    return Pill(look.label, color: look.accent, icon: look.icon);
  }
}

// ---------------------------------------------------------------------------
// Layout building blocks
// ---------------------------------------------------------------------------

/// White rounded surface with a soft shadow. Tappable when [onTap] is given.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.onTap,
    this.color,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(20);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color ?? Colors.white,
        borderRadius: radius,
        boxShadow: AppShadows.card,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Kept for screens that still use the old name.
class SectionCard extends AppCard {
  const SectionCard({
    super.key,
    required super.child,
    super.padding = const EdgeInsets.all(18),
  });
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Text(
                action!,
                style: const TextStyle(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w600,
                  fontSize: 13.5,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Rounded square with a tinted icon.
class IconTile extends StatelessWidget {
  const IconTile(
    this.icon, {
    super.key,
    this.color = AppColors.brand,
    this.background,
    this.size = 44,
  });
  final IconData icon;
  final Color color;
  final Color? background;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: background ?? color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(size * 0.32),
      ),
      child: Icon(icon, color: color, size: size * 0.5),
    );
  }
}

class EmptyMessage extends StatelessWidget {
  const EmptyMessage({
    super.key,
    required this.icon,
    required this.title,
    this.body,
    this.action,
  });
  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconTile(
              icon,
              size: 64,
              color: AppColors.brand,
              background: AppColors.brandSoft,
            ),
            const SizedBox(height: 18),
            Text(
              title,
              style: theme.textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            if (body != null) ...[
              const SizedBox(height: 6),
              Text(
                body!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.muted,
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...[const SizedBox(height: 22), action!],
          ],
        ),
      ),
    );
  }
}

/// Coloured callout for tips and warnings.
class Callout extends StatelessWidget {
  const Callout(
    this.text, {
    super.key,
    this.icon = Icons.info_outline_rounded,
    this.color = AppColors.info,
    this.background = AppColors.infoSoft,
  });
  final String text;
  final IconData icon;
  final Color color, background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: color,
                fontSize: 13.5,
                height: 1.4,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

void showError(BuildContext context, Object error) {
  final message = error is Exception
      ? error.toString()
      : 'Something went wrong. Please try again.';
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String formatDate(DateTime? d) =>
    d == null ? '—' : '${d.day} ${_months[d.month - 1]} ${d.year}';

/// Formats a calendar date string like "2026-10-11".
String formatIsoDate(String? s) {
  if (s == null || s.isEmpty) return '—';
  final d = DateTime.tryParse(s);
  return d == null ? s : formatDate(d);
}

String formatDateTime(DateTime? d) {
  if (d == null) return '—';
  final h = d.hour.toString().padLeft(2, '0');
  final m = d.minute.toString().padLeft(2, '0');
  return '${formatDate(d)}, $h:$m';
}

String timeAgo(DateTime d) {
  final diff = DateTime.now().difference(d);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 30) return '${diff.inDays}d ago';
  return formatDate(d);
}

String capitalize(String s) =>
    s.isEmpty ? s : s[0].toUpperCase() + s.substring(1).replaceAll('_', ' ');

String formatMoney(double amount, [String currency = 'ETB']) {
  final fixed = amount.toStringAsFixed(2);
  final parts = fixed.split('.');
  final whole = parts[0].replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );
  return '$currency $whole.${parts[1]}';
}

String formatDistance(double? km) {
  if (km == null) return '';
  if (km < 1) return '${(km * 1000).round()} m';
  return km < 10 ? '${km.toStringAsFixed(1)} km' : '${km.round()} km';
}

String formatDuration(double minutes) {
  if (minutes < 1) return '1 min';
  if (minutes < 60) return '${minutes.round()} min';
  final h = minutes ~/ 60;
  final m = (minutes % 60).round();
  return m == 0 ? '$h h' : '$h h $m min';
}

// ---------------------------------------------------------------------------
// Navigation between tabs
// ---------------------------------------------------------------------------

/// Lets any screen switch the bottom-navigation tab.
class HomeTabs extends InheritedWidget {
  const HomeTabs({super.key, required this.goTo, required super.child});
  final void Function(int index) goTo;

  static const home = 0, nearby = 1, orders = 2, profile = 3;

  static HomeTabs? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<HomeTabs>();

  @override
  bool updateShouldNotify(HomeTabs oldWidget) => false;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

(Color, String) orderStatusLook(String status) => switch (status) {
  'pending' => (AppColors.warning, 'Waiting for pharmacy'),
  'confirmed' => (AppColors.info, 'Ready for pickup'),
  'completed' => (AppColors.success, 'Collected'),
  'rejected' => (AppColors.danger, 'Declined'),
  'cancelled' => (AppColors.muted, 'Cancelled'),
  _ => (AppColors.muted, capitalize(status)),
};

class OrderStatusChip extends StatelessWidget {
  const OrderStatusChip(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (color, label) = orderStatusLook(status);
    return Pill(label, color: color);
  }
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

/// The MediTrack mark (cross with a check), drawn to match the web logo.
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 32, this.inverted = false});
  final double size;
  final bool inverted;

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(size), painter: _LogoPainter(inverted));
}

class _LogoPainter extends CustomPainter {
  _LogoPainter(this.inverted);
  final bool inverted;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 32;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(9 * s)),
      Paint()..color = inverted ? Colors.white : AppColors.brand,
    );
    final cross = Path()
      ..moveTo(13 * s, 8 * s)
      ..lineTo(19 * s, 8 * s)
      ..lineTo(19 * s, 13 * s)
      ..lineTo(24 * s, 13 * s)
      ..lineTo(24 * s, 19 * s)
      ..lineTo(19 * s, 19 * s)
      ..lineTo(19 * s, 24 * s)
      ..lineTo(13 * s, 24 * s)
      ..lineTo(13 * s, 19 * s)
      ..lineTo(8 * s, 19 * s)
      ..lineTo(8 * s, 13 * s)
      ..lineTo(13 * s, 13 * s)
      ..close();
    canvas.drawPath(
      cross,
      Paint()..color = inverted ? AppColors.brand : Colors.white,
    );
    final check = Path()
      ..moveTo(19.5 * s, 19.5 * s)
      ..lineTo(22.5 * s, 22.5 * s)
      ..lineTo(27.5 * s, 16.5 * s);
    canvas.drawPath(
      check,
      Paint()
        ..color = inverted ? AppColors.brandDark : AppColors.mint
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6 * s
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(covariant _LogoPainter oldDelegate) =>
      oldDelegate.inverted != inverted;
}
