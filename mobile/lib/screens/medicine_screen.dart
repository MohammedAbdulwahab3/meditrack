import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/models.dart';
import '../services/location.dart';
import '../services/routing.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import '../widgets/map.dart';
import '../widgets/medicine_art.dart';
import 'pharmacy_screen.dart';
import 'reserve_sheet.dart';

/// One medicine and every pharmacy that has it in stock, nearest first.
class MedicineGroup {
  MedicineGroup(this.product, this.offers);
  final OfferProduct product;
  final List<Offer> offers;

  MedicineForm get form => medicineFormOf(product.dosageForm);
  String get currency => offers.first.currency;
  double get minPrice =>
      offers.map((o) => o.unitPrice).reduce((a, b) => a < b ? a : b);
  double? get nearestKm {
    final ds = offers.map((o) => o.distanceKm).whereType<double>();
    return ds.isEmpty ? null : ds.reduce((a, b) => a < b ? a : b);
  }
}

int _byDistance(Offer a, Offer b) {
  final da = a.distanceKm, db = b.distanceKm;
  if (da != null && db != null && da != db) return da.compareTo(db);
  if (da == null && db != null) return 1;
  if (da != null && db == null) return -1;
  return a.unitPrice.compareTo(b.unitPrice);
}

/// Groups offers by medicine; medicines in stock closest to the patient come first.
List<MedicineGroup> groupOffers(List<Offer> offers) {
  final byId = <String, List<Offer>>{};
  for (final o in offers) {
    byId.putIfAbsent(o.product.id, () => []).add(o);
  }
  final groups = [
    for (final list in byId.values)
      MedicineGroup(list.first.product, list..sort(_byDistance)),
  ];
  groups.sort((a, b) {
    final da = a.nearestKm, db = b.nearestKm;
    if (da != null && db != null && (da - db).abs() > 0.05) {
      return da.compareTo(db);
    }
    if (da == null && db != null) return 1;
    if (da != null && db == null) return -1;
    return b.offers.length.compareTo(a.offers.length);
  });
  return groups;
}

/// Money without trailing ".00", for compact labels.
String shortMoney(double amount, String currency) {
  final s = formatMoney(amount, currency);
  return s.endsWith('.00') ? s.substring(0, s.length - 3) : s;
}

class RxBadge extends StatelessWidget {
  const RxBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Text(
        'Rx',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: AppColors.info,
        ),
      ),
    );
  }
}

enum _Sort { nearest, cheapest }

/// A medicine: where to get it, nearest pharmacies first, with the route to the chosen one.
class MedicineScreen extends StatefulWidget {
  const MedicineScreen({super.key, required this.group});
  final MedicineGroup group;

  @override
  State<MedicineScreen> createState() => _MedicineScreenState();
}

class _MedicineScreenState extends State<MedicineScreen> {
  final _map = MapController();
  final _sheet = DraggableScrollableController();
  final _location = LocationService.instance;
  final _routes = <String, RouteInfo>{};
  late List<Offer> _offers = [...widget.group.offers];
  _Sort _sort = _Sort.nearest;
  Offer? _selected;
  bool _routing = false;
  bool _mapReady = false;
  bool _locating = false;

  OfferProduct get product => widget.group.product;

  @override
  void initState() {
    super.initState();
    _offers.sort(_byDistance);
    _selected = _offers.firstOrNull;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!_location.hasFix) await _findMe();
      if (_selected != null) _select(_selected!, collapse: false);
    });
  }

  @override
  void dispose() {
    _sheet.dispose();
    super.dispose();
  }

  LatLng? _pointOf(Offer o) => o.seller.hasLocation
      ? LatLng(o.seller.latitude!, o.seller.longitude!)
      : null;

  Offer? get _nearest {
    final withKm = _offers.where((o) => o.distanceKm != null).toList()
      ..sort(_byDistance);
    return withKm.firstOrNull;
  }

  Offer get _cheapest =>
      _offers.reduce((a, b) => b.unitPrice < a.unitPrice ? b : a);

  /// Gets a location fix, then reloads distances from the server so they are accurate.
  Future<void> _findMe() async {
    setState(() => _locating = true);
    final me = await _location.locate();
    if (me != null && mounted) {
      try {
        final fresh = await AppScope.read(
          context,
        ).api.offers(q: product.name, lat: me.latitude, lng: me.longitude);
        final mine = fresh.where((o) => o.product.id == product.id).toList();
        if (mine.isNotEmpty && mounted) {
          setState(() {
            _offers = mine;
            _applySort();
            _selected = _nearest ?? _offers.first;
          });
        }
      } catch (_) {
        // Keep what we have; distances just stay unknown.
      }
    }
    if (mounted) setState(() => _locating = false);
    _fitOverview();
  }

  void _applySort() {
    _offers.sort(
      _sort == _Sort.nearest
          ? _byDistance
          : (a, b) => a.unitPrice != b.unitPrice
                ? a.unitPrice.compareTo(b.unitPrice)
                : _byDistance(a, b),
    );
  }

  Future<void> _select(Offer o, {bool collapse = true}) async {
    setState(() => _selected = o);
    if (collapse && _sheet.isAttached && _sheet.size > 0.6) {
      _sheet.animateTo(
        0.5,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
      );
    }
    final me = _location.position;
    final dest = _pointOf(o);
    if (dest == null) return;
    if (me == null) {
      _map.move(dest, 15);
      return;
    }
    final cached = _routes[o.seller.id];
    if (cached != null) {
      _fitRoute(cached);
      return;
    }
    setState(() => _routing = true);
    final route = await RoutingService().drive(me, dest);
    if (!mounted) return;
    _routes[o.seller.id] = route;
    setState(() => _routing = false);
    if (_selected?.seller.id == o.seller.id) _fitRoute(route);
  }

  EdgeInsets get _mapPadding {
    final top = MediaQuery.of(context).padding.top;
    return EdgeInsets.fromLTRB(48, top + 76, 48, 36);
  }

  void _fitRoute(RouteInfo route) {
    if (!_mapReady) return;
    final points = [
      ...route.points,
      if (_location.position != null) _location.position!,
    ];
    if (points.length < 2) return;
    _map.fitCamera(
      CameraFit.bounds(
        bounds: LatLngBounds.fromPoints(points),
        padding: _mapPadding,
        maxZoom: 16,
      ),
    );
  }

  /// Shows you and the pharmacies around you (far-away towns are left out of the frame).
  void _fitOverview() {
    if (!_mapReady) return;
    final me = _location.position;
    final near = _offers
        .where((o) => o.distanceKm == null || o.distanceKm! < 40)
        .map(_pointOf)
        .whereType<LatLng>()
        .toList();
    final points = [?me, ...near];
    if (points.length >= 2) {
      _map.fitCamera(
        CameraFit.bounds(
          bounds: LatLngBounds.fromPoints(points),
          padding: _mapPadding,
          maxZoom: 15,
        ),
      );
    } else if (points.length == 1) {
      _map.move(points.first, 14);
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

  void _directions(Offer o) {
    final d = _pointOf(o);
    if (d == null) return;
    _open(
      Uri.parse(
        'https://www.google.com/maps/dir/?api=1&destination=${d.latitude},${d.longitude}&travelmode=driving',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final top = MediaQuery.of(context).padding.top;
    final me = _location.position;
    final sel = _selected;
    final route = sel == null ? null : _routes[sel.seller.id];
    final located = _offers.where((o) => _pointOf(o) != null).toList();
    final start = me ?? (located.isNotEmpty ? _pointOf(located.first) : null);

    return Scaffold(
      body: Stack(
        children: [
          SizedBox(
            height: size.height * 0.56,
            child: start == null
                ? Container(color: AppColors.brandSoft)
                : FlutterMap(
                    mapController: _map,
                    options: MapOptions(
                      backgroundColor: mapBackground,
                      initialCenter: start,
                      initialZoom: 13,
                      onMapReady: () {
                        _mapReady = true;
                        if (route != null) {
                          _fitRoute(route);
                        } else {
                          _fitOverview();
                        }
                      },
                    ),
                    children: [
                      ...baseMapLayers(context),
                      if (route != null)
                        PolylineLayer(
                          polylines: [
                            Polyline(
                              points: route.points,
                              strokeWidth: 6,
                              color: AppColors.brand,
                              borderStrokeWidth: 2.5,
                              borderColor: Colors.white,
                              pattern: route.approximate
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
                          // Selected last, so it draws on top.
                          for (final o in [
                            ...located.where((o) => o != sel),
                            if (sel != null && located.contains(sel)) sel,
                          ])
                            priceMarker(
                              _pointOf(o)!,
                              shortMoney(o.unitPrice, o.currency),
                              selected: o == sel,
                              onTap: () => _select(o),
                            ),
                        ],
                      ),
                      mapAttribution(),
                    ],
                  ),
          ),
          Positioned(
            top: top + 8,
            left: 12,
            child: MapButton(
              icon: Icons.arrow_back_rounded,
              tooltip: 'Back',
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
          if (start != null)
            Positioned(
              top: top + 8,
              right: 12,
              child: MapButton(
                icon: route != null
                    ? Icons.route_rounded
                    : Icons.center_focus_strong_rounded,
                tooltip: 'Fit map',
                onPressed: () =>
                    route != null ? _fitRoute(route) : _fitOverview(),
              ),
            ),
          DraggableScrollableSheet(
            controller: _sheet,
            initialChildSize: 0.5,
            minChildSize: 0.46,
            maxChildSize: 0.94,
            snap: true,
            snapSizes: const [0.5, 0.94],
            builder: (context, scroll) => Container(
              decoration: const BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                boxShadow: AppShadows.floating,
              ),
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 32),
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
                  const SizedBox(height: 14),
                  _ProductHeader(product: product),
                  const SizedBox(height: 16),
                  if (me == null) ...[
                    Callout(
                      _locating
                          ? 'Finding your location…'
                          : _location.problem.isNotEmpty
                          ? _location.problem
                          : 'Turn on location to see the nearest pharmacy and the route.',
                      icon: Icons.location_searching_rounded,
                      color: AppColors.info,
                      background: AppColors.infoSoft,
                    ),
                    if (!_locating)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: () async {
                            if (_location.status ==
                                    LocationStatus.deniedForever ||
                                _location.status == LocationStatus.serviceOff) {
                              await _location.openSettings();
                            }
                            await _findMe();
                            if (_selected != null) _select(_selected!);
                          },
                          icon: const Icon(Icons.my_location_rounded),
                          label: const Text('Use my location'),
                        ),
                      ),
                    const SizedBox(height: 12),
                  ],
                  if (sel != null)
                    _SelectedPharmacy(
                      offer: sel,
                      route: route,
                      routing: _routing,
                      isNearest: _nearest == sel,
                      isCheapest: _cheapest == sel && _offers.length > 1,
                      onReserve: () => showReserveSheet(context, sel),
                      onDirections: sel.seller.hasLocation
                          ? () => _directions(sel)
                          : null,
                      onCall: sel.seller.phone.isEmpty
                          ? null
                          : () => _open(
                              Uri(
                                scheme: 'tel',
                                path: sel.seller.phone.replaceAll(' ', ''),
                              ),
                            ),
                      onDetails: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => PharmacyScreen(
                            pharmacy: Pharmacy.fromSeller(
                              sel.seller,
                              distanceKm: sel.distanceKm,
                            ),
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Pharmacies',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            Text(
                              '${_offers.length} have it in stock',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      SegmentedButton<_Sort>(
                        showSelectedIcon: false,
                        style: const ButtonStyle(
                          visualDensity: VisualDensity.compact,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        segments: const [
                          ButtonSegment(
                            value: _Sort.nearest,
                            label: Text('Nearest'),
                          ),
                          ButtonSegment(
                            value: _Sort.cheapest,
                            label: Text('Cheapest'),
                          ),
                        ],
                        selected: {_sort},
                        onSelectionChanged: (s) => setState(() {
                          _sort = s.first;
                          _applySort();
                        }),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  AppCard(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      children: [
                        for (final (i, o) in _offers.indexed) ...[
                          if (i > 0) const Divider(indent: 66, endIndent: 16),
                          _PharmacyOption(
                            offer: o,
                            rank: i + 1,
                            selected: o == sel,
                            nearest: _nearest == o,
                            cheapest: _cheapest == o && _offers.length > 1,
                            onTap: () => _select(o),
                          ),
                        ],
                      ],
                    ),
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

class _ProductHeader extends StatelessWidget {
  const _ProductHeader({required this.product});
  final OfferProduct product;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = product;
    return Row(
      children: [
        SizedBox(
          width: 88,
          height: 88,
          child: Hero(
            tag: 'medicine-art-${p.id}',
            child: MedicineArt(
              dosageForm: p.dosageForm,
              seed: p.name + p.genericName,
              borderRadius: 20,
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${p.name} ${p.strength}',
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: 2),
              Text(
                [
                  p.genericName,
                  p.dosageForm,
                  if (p.packSize.isNotEmpty) p.packSize,
                ].join(' · '),
                style: theme.textTheme.bodySmall,
              ),
              if (p.requiresPrescription) ...[
                const SizedBox(height: 8),
                const Pill(
                  'Prescription needed at pickup',
                  color: AppColors.info,
                  icon: Icons.description_outlined,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _SelectedPharmacy extends StatelessWidget {
  const _SelectedPharmacy({
    required this.offer,
    required this.route,
    required this.routing,
    required this.isNearest,
    required this.isCheapest,
    required this.onReserve,
    required this.onDirections,
    required this.onCall,
    required this.onDetails,
  });
  final Offer offer;
  final RouteInfo? route;
  final bool routing, isNearest, isCheapest;
  final VoidCallback onReserve, onDetails;
  final VoidCallback? onDirections, onCall;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = offer.seller;
    final km = route?.distanceKm ?? offer.distanceKm;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
        boxShadow: AppShadows.card,
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (isNearest)
                      const Pill(
                        'Nearest to you',
                        color: AppColors.brand,
                        icon: Icons.near_me_rounded,
                      ),
                    if (isCheapest)
                      const Pill(
                        'Best price',
                        color: AppColors.success,
                        icon: Icons.sell_outlined,
                      ),
                    if (!isNearest && !isCheapest)
                      const Pill(
                        'Selected',
                        color: AppColors.muted,
                        icon: Icons.check_rounded,
                      ),
                  ],
                ),
              ),
              TextButton(onPressed: onDetails, child: const Text('Details')),
            ],
          ),
          const SizedBox(height: 4),
          Text(s.name, style: theme.textTheme.titleLarge),
          const SizedBox(height: 2),
          Text(
            [s.address, s.city].where((x) => x.isNotEmpty).join(', '),
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.field,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                _Stat(
                  icon: Icons.route_rounded,
                  label: 'Distance',
                  value: routing && route == null
                      ? '…'
                      : km == null
                      ? '—'
                      : '${route?.approximate == true ? '≈ ' : ''}${formatDistance(km)}',
                ),
                const _StatDivider(),
                _Stat(
                  icon: Icons.directions_car_rounded,
                  label: 'Drive',
                  value: route != null
                      ? formatDuration(route!.durationMin)
                      : routing
                      ? '…'
                      : '—',
                ),
                const _StatDivider(),
                _Stat(
                  icon: Icons.sell_outlined,
                  label: 'Price',
                  value: shortMoney(offer.unitPrice, offer.currency),
                ),
              ],
            ),
          ),
          if (offer.available <= 5) ...[
            const SizedBox(height: 10),
            Text(
              'Only ${offer.available} left here, reserve to hold one.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.warning,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: onReserve,
            icon: const Icon(Icons.shopping_bag_outlined),
            label: const Text('Reserve for pickup'),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onDirections,
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                  icon: const Icon(Icons.navigation_rounded, size: 20),
                  label: const FittedBox(child: Text('Start navigation')),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onCall,
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                  icon: const Icon(Icons.call_rounded, size: 20),
                  label: const Text('Call'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label, value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Column(
        children: [
          Icon(icon, size: 18, color: AppColors.brand),
          const SizedBox(height: 4),
          Text(
            value,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Text(label, style: theme.textTheme.labelSmall),
        ],
      ),
    );
  }
}

class _StatDivider extends StatelessWidget {
  const _StatDivider();

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 36, color: AppColors.line);
}

class _PharmacyOption extends StatelessWidget {
  const _PharmacyOption({
    required this.offer,
    required this.rank,
    required this.selected,
    required this.nearest,
    required this.cheapest,
    required this.onTap,
  });
  final Offer offer;
  final int rank;
  final bool selected, nearest, cheapest;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final o = offer;
    return InkWell(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        color: selected ? AppColors.brandSoft : Colors.transparent,
        padding: const EdgeInsets.fromLTRB(14, 12, 16, 12),
        child: Row(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: selected ? AppColors.brand : AppColors.field,
              ),
              child: selected
                  ? const Icon(
                      Icons.check_rounded,
                      color: Colors.white,
                      size: 20,
                    )
                  : Text(
                      '$rank',
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: AppColors.muted,
                      ),
                    ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    o.seller.name,
                    style: theme.textTheme.titleSmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    [
                      if (o.distanceKm != null) formatDistance(o.distanceKm),
                      if (o.seller.city.isNotEmpty) o.seller.city,
                      o.available <= 5
                          ? 'only ${o.available} left'
                          : '${o.available} in stock',
                    ].join(' · '),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: o.available <= 5 ? AppColors.warning : null,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (nearest || cheapest) ...[
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      children: [
                        if (nearest)
                          const Pill('Nearest', color: AppColors.brand),
                        if (cheapest)
                          const Pill('Cheapest', color: AppColors.success),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              shortMoney(o.unitPrice, o.currency),
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: selected ? AppColors.brandDeep : AppColors.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
