import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../services/location.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import 'pharmacy_screen.dart';
import 'reserve_sheet.dart';

/// Search a medicine across pharmacies; the nearest pharmacies are listed first.
class MedicineSearchScreen extends StatefulWidget {
  const MedicineSearchScreen({super.key});

  @override
  State<MedicineSearchScreen> createState() => _MedicineSearchScreenState();
}

class _MedicineSearchScreenState extends State<MedicineSearchScreen> {
  final _q = TextEditingController();
  final _location = LocationService.instance;
  Timer? _debounce;
  Future<List<Offer>>? _future;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      _search();
      if (!_location.hasFix) {
        await _location.locate();
        if (mounted) _search();
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  void _search() {
    final p = _location.position;
    setState(() {
      _future = AppScope.read(
        context,
      ).api.offers(q: _q.text.trim(), lat: p?.latitude, lng: p?.longitude);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Find medicine')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: TextField(
              controller: _q,
              autofocus: true,
              textInputAction: TextInputAction.search,
              onChanged: (_) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 350), _search);
              },
              decoration: InputDecoration(
                hintText: 'Search a medicine, e.g. amoxicillin',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _location.hasFix
                    ? const Tooltip(
                        message: 'Sorted by distance',
                        child: Icon(
                          Icons.near_me_rounded,
                          color: AppColors.brand,
                        ),
                      )
                    : null,
              ),
            ),
          ),
          Expanded(
            child: FutureBuilder<List<Offer>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snap.hasError) {
                  return EmptyMessage(
                    icon: Icons.cloud_off_rounded,
                    title: "Couldn't search right now",
                    body: snap.error is ApiException
                        ? (snap.error as ApiException).message
                        : null,
                    action: FilledButton(
                      onPressed: _search,
                      child: const Text('Try again'),
                    ),
                  );
                }
                // Group by medicine, keeping the server's nearest-first order.
                final groups = <String, List<Offer>>{};
                for (final o in snap.data!) {
                  groups.putIfAbsent(o.product.id, () => []).add(o);
                }
                if (groups.isEmpty) {
                  return EmptyMessage(
                    icon: Icons.medication_outlined,
                    title: _q.text.isEmpty
                        ? 'No medicines listed yet'
                        : 'No pharmacy has this in stock',
                    body: 'Try the generic name, e.g. paracetamol.',
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  itemCount: groups.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 14),
                  itemBuilder: (context, i) =>
                      _MedicineCard(offers: groups.values.elementAt(i)),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _MedicineCard extends StatelessWidget {
  const _MedicineCard({required this.offers});
  final List<Offer> offers;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = offers.first.product;
    final cheapest = offers
        .map((o) => o.unitPrice)
        .reduce((a, b) => a < b ? a : b);
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const IconTile(Icons.medication_rounded, size: 44),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${p.name} ${p.strength}',
                        style: theme.textTheme.titleMedium,
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
                        const SizedBox(height: 6),
                        const Pill(
                          'Prescription at pickup',
                          color: AppColors.info,
                          icon: Icons.description_outlined,
                        ),
                      ],
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('from', style: theme.textTheme.labelSmall),
                    Text(
                      formatMoney(cheapest, offers.first.currency),
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          for (final o in offers) ...[
            const Divider(indent: 16, endIndent: 16),
            InkWell(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => PharmacyScreen(
                    pharmacy: Pharmacy.fromSeller(
                      o.seller,
                      distanceKm: o.distanceKm,
                    ),
                  ),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
                child: Row(
                  children: [
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
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              if (o.distanceKm != null)
                                Pill(
                                  formatDistance(o.distanceKm),
                                  color: AppColors.brand,
                                  icon: Icons.near_me_rounded,
                                ),
                              Text(
                                formatMoney(o.unitPrice, o.currency),
                                style: theme.textTheme.titleSmall?.copyWith(
                                  color: AppColors.brandDark,
                                ),
                              ),
                              if (o.available <= 5)
                                Pill(
                                  'Only ${o.available} left',
                                  color: AppColors.warning,
                                ),
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
              ),
            ),
          ],
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}
