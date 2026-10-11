import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;

import '../theme.dart';

/// Clean, light basemap (CARTO Voyager on OpenStreetMap data) with the required attribution.
List<Widget> baseMapLayers(BuildContext context) => [
  TileLayer(
    urlTemplate:
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: const ['a', 'b', 'c', 'd'],
    retinaMode: RetinaMode.isHighDensity(context),
    userAgentPackageName: 'com.meditrack.meditrack',
    maxZoom: 20,
  ),
];

Widget mapAttribution() => const SimpleAttributionWidget(
  source: Text(
    '© OpenStreetMap contributors © CARTO',
    style: TextStyle(fontSize: 10),
  ),
  backgroundColor: Color(0xCCFFFFFF),
);

/// The user's position: a blue dot with a soft halo.
Marker myLocationMarker(LatLng point) => Marker(
  point: point,
  width: 36,
  height: 36,
  child: Container(
    decoration: BoxDecoration(
      color: const Color(0xFF2563EB).withValues(alpha: 0.18),
      shape: BoxShape.circle,
    ),
    alignment: Alignment.center,
    child: Container(
      width: 16,
      height: 16,
      decoration: BoxDecoration(
        color: const Color(0xFF2563EB),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 6)],
      ),
    ),
  ),
);

/// A pharmacy pin. Selected pins are larger and dark.
Marker pharmacyMarker(
  LatLng point, {
  bool selected = false,
  VoidCallback? onTap,
}) {
  final size = selected ? 52.0 : 42.0;
  return Marker(
    point: point,
    width: size,
    height: size,
    alignment: Alignment.topCenter,
    child: GestureDetector(
      onTap: onTap,
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          Icon(
            Icons.location_on,
            size: size,
            color: selected ? AppColors.brandDeep : AppColors.brand,
            shadows: const [
              Shadow(
                color: Color(0x55000000),
                blurRadius: 8,
                offset: Offset(0, 3),
              ),
            ],
          ),
          Padding(
            padding: EdgeInsets.only(top: size * 0.17),
            child: Icon(
              Icons.local_pharmacy_rounded,
              size: size * 0.36,
              color: Colors.white,
            ),
          ),
        ],
      ),
    ),
  );
}

/// Round white map control (e.g. "recenter").
class MapButton extends StatelessWidget {
  const MapButton({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
  });
  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 3,
      shadowColor: const Color(0x40000000),
      child: IconButton(
        icon: Icon(icon, color: AppColors.ink),
        onPressed: onPressed,
        tooltip: tooltip,
      ),
    );
  }
}

/// A price tag pinned to a pharmacy. The selected one is dark and slightly larger.
Marker priceMarker(
  LatLng point,
  String label, {
  bool selected = false,
  VoidCallback? onTap,
}) {
  return Marker(
    point: point,
    width: 104,
    height: 46,
    alignment: Alignment.topCenter,
    child: GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: EdgeInsets.symmetric(
              horizontal: selected ? 11 : 9,
              vertical: selected ? 7 : 5,
            ),
            decoration: BoxDecoration(
              color: selected ? AppColors.brandDeep : Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: selected ? AppColors.brandDeep : AppColors.line,
              ),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x330F172A),
                  blurRadius: 8,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.local_pharmacy_rounded,
                  size: selected ? 14 : 12,
                  color: selected ? AppColors.mint : AppColors.brand,
                ),
                const SizedBox(width: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: selected ? 12.5 : 11.5,
                    fontWeight: FontWeight.w700,
                    color: selected ? Colors.white : AppColors.ink,
                  ),
                ),
              ],
            ),
          ),
          CustomPaint(
            size: const Size(12, 6),
            painter: _TailPainter(
              selected ? AppColors.brandDeep : Colors.white,
            ),
          ),
        ],
      ),
    ),
  );
}

class _TailPainter extends CustomPainter {
  _TailPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawPath(
      Path()
        ..moveTo(0, 0)
        ..lineTo(size.width, 0)
        ..lineTo(size.width / 2, size.height)
        ..close(),
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(_TailPainter old) => old.color != color;
}
