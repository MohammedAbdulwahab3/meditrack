import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../services/location.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import '../widgets/map.dart';
import 'medicine_search_screen.dart';
import 'pharmacy_screen.dart';

/// Pharmacies around the user, nearest first, as a list or on a map.
class NearbyScreen extends StatefulWidget {
  const NearbyScreen({super.key});

  @override
  State<NearbyScreen> createState() => _NearbyScreenState();
}

class _NearbyScreenState extends State<NearbyScreen> {
  final _location = LocationService.instance;
  final _query = TextEditingController();
  Timer? _debounce;
  bool _mapView = false;
  Future<List<Pharmacy>>? _future;
  LatLng? _loadedFor;

  @override
  void initState() {
    super.initState();
    _location.addListener(_onLocation);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _reload();
      _location.locate();
    });
  }

  @override
  void dispose() {
    _location.removeListener(_onLocation);
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _onLocation() {
    if (!mounted) return;
    if (_location.position != null && _location.position != _loadedFor) {
      _reload();
    } else {
      setState(() {});
    }
  }

  void _reload() {
    final p = _location.position;
    _loadedFor = p;
    setState(() {
      _future = AppScope.read(context).api.pharmacies(
        q: _query.text.trim(),
        lat: p?.latitude,
        lng: p?.longitude,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nearby pharmacies'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: SegmentedButton<bool>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(
                  value: false,
                  icon: Icon(Icons.view_list_rounded, size: 20),
                ),
                ButtonSegment(
                  value: true,
                  icon: Icon(Icons.map_outlined, size: 20),
                ),
              ],
              selected: {_mapView},
              onSelectionChanged: (s) => setState(() => _mapView = s.first),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _query,
                    onChanged: (_) {
                      _debounce?.cancel();
                      _debounce = Timer(
                        const Duration(milliseconds: 350),
                        _reload,
                      );
                    },
                    textInputAction: TextInputAction.search,
                    decoration: const InputDecoration(
                      hintText: 'Search pharmacy or area',
                      prefixIcon: Icon(Icons.search_rounded),
                      contentPadding: EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Material(
                  color: AppColors.brand,
                  borderRadius: BorderRadius.circular(14),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const MedicineSearchScreen(),
                      ),
                    ),
                    child: const Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 14,
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.medication_rounded,
                            color: Colors.white,
                            size: 20,
                          ),
                          SizedBox(width: 6),
                          Text(
                            'Medicine',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (!_location.hasFix &&
              _location.status != LocationStatus.locating &&
              _location.status != LocationStatus.unknown)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: _LocationPrompt(location: _location),
            ),
          Expanded(
            child: FutureBuilder<List<Pharmacy>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snap.hasError) {
                  return EmptyMessage(
                    icon: Icons.cloud_off_rounded,
                    title: "Couldn't load pharmacies",
                    body: snap.error is ApiException
                        ? (snap.error as ApiException).message
                        : null,
                    action: FilledButton(
                      onPressed: _reload,
                      child: const Text('Try again'),
                    ),
                  );
                }
                final list = snap.data!;
                if (list.isEmpty) {
                  return const EmptyMessage(
                    icon: Icons.local_pharmacy_outlined,
                    title: 'No pharmacies found',
                    body: 'Try another name or area.',
                  );
                }
                return _mapView
                    ? _PharmacyMap(pharmacies: list, me: _location.position)
                    : RefreshIndicator(
                        onRefresh: () async {
                          await _location.locate(force: true);
                          _reload();
                          await _future;
                        },
                        child: ListView.separated(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                          itemCount: list.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 12),
                          itemBuilder: (context, i) =>
                              PharmacyCard(pharmacy: list[i]),
                        ),
                      );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class PharmacyCard extends StatelessWidget {
  const PharmacyCard({super.key, required this.pharmacy});
  final Pharmacy pharmacy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = pharmacy;
    return AppCard(
      padding: const EdgeInsets.all(16),
      onTap: () => Navigator.of(
        context,
      ).push(MaterialPageRoute(builder: (_) => PharmacyScreen(pharmacy: p))),
      child: Row(
        children: [
          const IconTile(Icons.local_pharmacy_rounded, size: 48),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.name,
                  style: theme.textTheme.titleSmall?.copyWith(fontSize: 15),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  [p.address, p.city].where((s) => s.isNotEmpty).join(', '),
                  style: theme.textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (p.distanceKm != null)
                      Pill(
                        formatDistance(p.distanceKm),
                        color: AppColors.brand,
                        icon: Icons.near_me_rounded,
                      ),
                    Pill(
                      p.productsInStock == 0
                          ? 'No stock listed'
                          : '${p.productsInStock} medicines',
                      color: p.productsInStock == 0
                          ? AppColors.muted
                          : AppColors.info,
                      icon: Icons.medication_outlined,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
        ],
      ),
    );
  }
}

class _LocationPrompt extends StatelessWidget {
  const _LocationPrompt({required this.location});
  final LocationService location;

  @override
  Widget build(BuildContext context) {
    final settings =
        location.status == LocationStatus.deniedForever ||
        location.status == LocationStatus.serviceOff;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
      decoration: BoxDecoration(
        color: AppColors.warningSoft,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.location_off_outlined,
            color: AppColors.warning,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              location.problem,
              style: const TextStyle(color: Color(0xFF78350F), fontSize: 13),
            ),
          ),
          TextButton(
            onPressed: () => settings
                ? location.openSettings()
                : location.locate(force: true),
            child: Text(settings ? 'Settings' : 'Allow'),
          ),
        ],
      ),
    );
  }
}

class _PharmacyMap extends StatefulWidget {
  const _PharmacyMap({required this.pharmacies, required this.me});
  final List<Pharmacy> pharmacies;
  final LatLng? me;

  @override
  State<_PharmacyMap> createState() => _PharmacyMapState();
}

class _PharmacyMapState extends State<_PharmacyMap> {
  final _map = MapController();
  Pharmacy? _selected;

  List<Pharmacy> get _located =>
      widget.pharmacies.where((p) => p.hasLocation).toList();

  CameraFit? _initialFit() {
    // Frame the user and the nearest few pharmacies.
    final points = <LatLng>[
      if (widget.me != null) widget.me!,
      for (final p in _located.take(widget.me != null ? 4 : 50))
        LatLng(p.latitude!, p.longitude!),
    ];
    if (points.length < 2) return null;
    return CameraFit.bounds(
      bounds: LatLngBounds.fromPoints(points),
      padding: const EdgeInsets.fromLTRB(48, 48, 48, 200),
      maxZoom: 16,
    );
  }

  @override
  Widget build(BuildContext context) {
    final located = _located;
    final center =
        widget.me ??
        (located.isNotEmpty
            ? LatLng(located.first.latitude!, located.first.longitude!)
            : const LatLng(9.0108, 38.7613));
    return Stack(
      children: [
        FlutterMap(
          mapController: _map,
          options: MapOptions(
            backgroundColor: mapBackground,
            initialCenter: center,
            initialZoom: 13,
            initialCameraFit: _initialFit(),
            onTap: (_, __) => setState(() => _selected = null),
          ),
          children: [
            ...baseMapLayers(context),
            MarkerLayer(
              markers: [
                if (widget.me != null) myLocationMarker(widget.me!),
                for (final p in located)
                  pharmacyMarker(
                    LatLng(p.latitude!, p.longitude!),
                    selected: _selected?.id == p.id,
                    onTap: () => setState(() => _selected = p),
                  ),
              ],
            ),
            mapAttribution(),
          ],
        ),
        if (widget.me != null)
          Positioned(
            right: 16,
            top: 12,
            child: MapButton(
              icon: Icons.my_location_rounded,
              tooltip: 'My location',
              onPressed: () => _map.move(widget.me!, 15),
            ),
          ),
        if (_selected != null)
          Positioned(
            left: 16,
            right: 16,
            bottom: 16,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                boxShadow: AppShadows.floating,
              ),
              child: PharmacyCard(pharmacy: _selected!),
            ),
          ),
      ],
    );
  }
}
