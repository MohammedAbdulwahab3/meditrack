import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

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
