import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../services/location.dart';
import '../services/routing.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import '../widgets/map.dart';
import '../widgets/medicine_art.dart';
import 'reserve_sheet.dart';

/// A pharmacy: where it is, the route from you, and what it has in stock.
class PharmacyScreen extends StatefulWidget {
  const PharmacyScreen({super.key, required this.pharmacy});
  final Pharmacy pharmacy;

  @override
  State<PharmacyScreen> createState() => _PharmacyScreenState();
}

class _PharmacyScreenState extends State<PharmacyScreen> {
  final _map = MapController();
  final _location = LocationService.instance;
  late final Future<List<Offer>> _stock;
  RouteInfo? _route;
  bool _routing = false;
  bool _mapReady = false;

  Pharmacy get p => widget.pharmacy;
  LatLng? get _dest => p.hasLocation ? LatLng(p.latitude!, p.longitude!) : null;

  @override
  void initState() {
    super.initState();
    final me = _location.position;
    _stock = AppScope.read(
      context,
    ).api.offers(sellerId: p.id, lat: me?.latitude, lng: me?.longitude);
    _loadRoute();
  }

  Future<void> _loadRoute() async {
    final me = _location.position ?? await _location.locate();
    final dest = _dest;
    if (me == null || dest == null || !mounted) return;
    setState(() => _routing = true);
    final route = await RoutingService().drive(me, dest);
    if (!mounted) return;
    setState(() {
      _route = route;
      _routing = false;
    });
    _fit();
  }

  void _fit() {
    if (!_mapReady) return;
    final points = <LatLng>[
      if (_route != null) ..._route!.points,
      if (_location.position != null) _location.position!,
      if (_dest != null) _dest!,
    ];
    if (points.length >= 2) {
      _map.fitCamera(
        CameraFit.bounds(
          bounds: LatLngBounds.fromPoints(points),
          padding: EdgeInsets.fromLTRB(
            56,
            MediaQuery.of(context).padding.top + 70,
            56,
            40,
          ),
          maxZoom: 16.5,
        ),
      );
    } else if (_dest != null) {
      _map.move(_dest!, 15.5);
    }
  }

  Future<void> _open(Uri uri) async {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
        mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't open that on this phone.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final me = _location.position;
    final dest = _dest;
    return Scaffold(
      body: Stack(
        children: [
          // ---- Map ----
          SizedBox(
            height: size.height * 0.5,
            child: dest == null
                ? Container(
                    color: AppColors.brandSoft,
                    alignment: Alignment.center,
                    child: const Text(
                      'This pharmacy has not added its map location yet.',
                    ),
                  )
                : FlutterMap(
                    mapController: _map,
                    options: MapOptions(
                      backgroundColor: mapBackground,
                      initialCenter: dest,
                      initialZoom: 15,
                      onMapReady: () {
                        _mapReady = true;
                        _fit();
                      },
                    ),
                    children: [
                      ...baseMapLayers(context),
                      if (_route != null)
                        PolylineLayer(
                          polylines: [
                            Polyline(
                              points: _route!.points,
                              strokeWidth: 6,
                              color: AppColors.brand,
                              borderStrokeWidth: 2.5,
                              borderColor: Colors.white,
                              pattern: _route!.approximate
                                  ? StrokePattern.dashed(
                                      segments: const [12, 10],
                                    )
                                  : const StrokePattern.solid(),
                            ),
                          ],
                        ),
                      MarkerLayer(
                        markers: [
                          if (me != null) myLocationMarker(me),
                          pharmacyMarker(dest, selected: true),
                        ],
                      ),
                      mapAttribution(),
                    ],
                  ),
          ),
          // ---- Top controls ----
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            child: MapButton(
              icon: Icons.arrow_back_rounded,
              tooltip: 'Back',
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
          if (dest != null)
            Positioned(
              top: MediaQuery.of(context).padding.top + 8,
              right: 12,
              child: MapButton(
                icon: Icons.center_focus_strong_rounded,
                tooltip: 'Fit route',
                onPressed: _fit,
              ),
            ),
          // ---- Details sheet ----
          DraggableScrollableSheet(
            initialChildSize: 0.55,
            minChildSize: 0.5,
            maxChildSize: 0.92,
            builder: (context, scroll) => Container(
              decoration: const BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                boxShadow: AppShadows.floating,
              ),
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 32),
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.line,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  _Header(
                    pharmacy: p,
                    route: _route,
                    routing: _routing,
                    hasMe: me != null,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: dest == null
                              ? null
                              : () => _open(
                                  Uri.parse(
                                    'https://www.google.com/maps/dir/?api=1&destination=${dest.latitude},${dest.longitude}&travelmode=driving',
                                  ),
                                ),
                          icon: const Icon(Icons.directions_rounded),
                          label: const Text('Directions'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: p.phone.isEmpty
                              ? null
                              : () => _open(
                                  Uri(
                                    scheme: 'tel',
                                    path: p.phone.replaceAll(' ', ''),
                                  ),
                                ),
                          icon: const Icon(Icons.call_rounded),
                          label: const Text('Call'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 26),
                  const SectionHeader('Medicines in stock'),
                  FutureBuilder<List<Offer>>(
                    future: _stock,
                    builder: (context, snap) {
                      if (snap.connectionState != ConnectionState.done) {
                        return const Padding(
                          padding: EdgeInsets.all(24),
                          child: Center(child: CircularProgressIndicator()),
                        );
                      }
                      if (snap.hasError) {
                        return Callout(
                          snap.error is ApiException
                              ? (snap.error as ApiException).message
                              : "Couldn't load stock.",
                          color: AppColors.danger,
                          background: AppColors.dangerSoft,
                          icon: Icons.error_outline_rounded,
                        );
                      }
                      final offers = snap.data!;
                      if (offers.isEmpty) {
                        return const AppCard(
                          child: Text(
                            "This pharmacy hasn't listed any medicines yet.",
                          ),
                        );
                      }
                      return AppCard(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Column(
                          children: [
                            for (final (i, o) in offers.indexed) ...[
                              if (i > 0)
                                const Divider(indent: 16, endIndent: 16),
                              _StockRow(offer: o),
                            ],
                          ],
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.verified_user_outlined,
                        size: 14,
                        color: AppColors.faint,
                      ),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          'Only genuine, in-date, non-recalled stock is shown.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                    ],
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

class _Header extends StatelessWidget {
  const _Header({
    required this.pharmacy,
    required this.route,
    required this.routing,
    required this.hasMe,
  });
  final Pharmacy pharmacy;
  final RouteInfo? route;
  final bool routing, hasMe;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = pharmacy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(p.name, style: theme.textTheme.headlineSmall),
        const SizedBox(height: 4),
        Text(
          [p.address, p.city].where((s) => s.isNotEmpty).join(', '),
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (route != null) ...[
              Pill(
                '${route!.approximate ? '≈ ' : ''}${formatDistance(route!.distanceKm)}',
                color: AppColors.brand,
                icon: Icons.route_rounded,
              ),
              Pill(
                '${formatDuration(route!.durationMin)} drive',
                color: AppColors.info,
                icon: Icons.directions_car_rounded,
              ),
            ] else if (routing)
              const Pill(
                'Finding route…',
                color: AppColors.muted,
                icon: Icons.route_rounded,
              )
            else if (p.distanceKm != null)
              Pill(
                formatDistance(p.distanceKm),
                color: AppColors.brand,
                icon: Icons.near_me_rounded,
              )
            else if (!hasMe && p.hasLocation)
              const Pill(
                'Turn on location for directions',
                color: AppColors.muted,
                icon: Icons.location_off_outlined,
              ),
            if (p.phone.isNotEmpty)
              Pill(p.phone, color: AppColors.muted, icon: Icons.call_outlined),
          ],
        ),
      ],
    );
  }
}

class _StockRow extends StatelessWidget {
  const _StockRow({required this.offer});
  final Offer offer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final o = offer;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
      child: Row(
        children: [
          SizedBox(
            width: 56,
            height: 56,
            child: MedicineArt(
              dosageForm: o.product.dosageForm,
              seed: o.product.name + o.product.genericName,
              borderRadius: 14,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${o.product.name} ${o.product.strength}',
                  style: theme.textTheme.titleSmall,
                ),
                const SizedBox(height: 2),
                Text(
                  '${o.product.genericName} · ${o.product.dosageForm}',
                  style: theme.textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text(
                      formatMoney(o.unitPrice, o.currency),
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: AppColors.brandDark,
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (o.available <= 5)
                      Pill(
                        'Only ${o.available} left',
                        color: AppColors.warning,
                      ),
                    if (o.product.requiresPrescription) ...[
                      const SizedBox(width: 6),
                      const Pill('Rx', color: AppColors.info),
                    ],
                  ],
                ),
              ],
            ),
          ),
          FilledButton.tonal(
            onPressed: () => showReserveSheet(context, o),
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 42),
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
            child: const Text('Reserve'),
          ),
        ],
      ),
    );
  }
}
