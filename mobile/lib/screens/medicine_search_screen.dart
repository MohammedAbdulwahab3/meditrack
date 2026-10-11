import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../services/location.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import '../widgets/medicine_art.dart';
import 'medicine_screen.dart';

/// Browse and search medicines that pharmacies have in stock, as a picture grid.
/// Medicines available closest to the patient come first.
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
  MedicineForm? _form;

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
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Find medicine')),
      body: FutureBuilder<List<Offer>>(
        future: _future,
        builder: (context, snap) {
          final loading = snap.connectionState != ConnectionState.done;
          final all = snap.hasData
              ? groupOffers(snap.data!)
              : <MedicineGroup>[];
          final forms = {for (final g in all) g.form}.toList()
            ..sort((a, b) => a.index.compareTo(b.index));
          final shown = _form == null
              ? all
              : all.where((g) => g.form == _form).toList();

          return CustomScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                  child: TextField(
                    controller: _q,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => _search(),
                    onChanged: (_) {
                      _debounce?.cancel();
                      _debounce = Timer(
                        const Duration(milliseconds: 350),
                        _search,
                      );
                      setState(() {});
                    },
                    decoration: InputDecoration(
                      hintText: 'Search by name, e.g. paracetamol',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _q.text.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Clear',
                              icon: const Icon(Icons.close_rounded),
                              onPressed: () {
                                _q.clear();
                                _search();
                              },
                            ),
                    ),
                  ),
                ),
              ),
              if (forms.length > 1)
                SliverToBoxAdapter(
                  child: SizedBox(
                    height: 56,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                      children: [
                        _FormChip(
                          label: 'All',
                          selected: _form == null,
                          onTap: () => setState(() => _form = null),
                        ),
                        for (final f in forms)
                          _FormChip(
                            label: medicineFormLabel(f),
                            selected: _form == f,
                            onTap: () =>
                                setState(() => _form = _form == f ? null : f),
                          ),
                      ],
                    ),
                  ),
                ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                  child: Row(
                    children: [
                      Icon(
                        _location.hasFix
                            ? Icons.near_me_rounded
                            : Icons.location_searching_rounded,
                        size: 15,
                        color: _location.hasFix
                            ? AppColors.brand
                            : AppColors.muted,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          loading
                              ? 'Searching pharmacies…'
                              : _location.hasFix
                              ? '${shown.length} medicines · nearest first'
                              : '${shown.length} medicines in stock',
                          style: theme.textTheme.labelMedium,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (loading)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (snap.hasError)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: EmptyMessage(
                    icon: Icons.cloud_off_rounded,
                    title: "Couldn't search right now",
                    body: snap.error is ApiException
                        ? (snap.error as ApiException).message
                        : null,
                    action: FilledButton(
                      onPressed: _search,
                      child: const Text('Try again'),
                    ),
                  ),
                )
              else if (shown.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: EmptyMessage(
                    icon: Icons.medication_outlined,
                    title: _q.text.isEmpty
                        ? 'No medicines listed yet'
                        : 'No pharmacy has this in stock',
                    body: 'Try the generic name, e.g. paracetamol.',
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 28),
                  sliver: SliverGrid(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 14,
                      crossAxisSpacing: 14,
                      mainAxisExtent:
                          142 + MediaQuery.textScalerOf(context).scale(1) * 104,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, i) => MedicineCard(group: shown[i]),
                      childCount: shown.length,
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _FormChip extends StatelessWidget {
  const _FormChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: selected ? AppColors.ink : Colors.white,
        shape: StadiumBorder(
          side: BorderSide(color: selected ? AppColors.ink : AppColors.line),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Center(
              child: Text(
                label,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: selected ? Colors.white : AppColors.body,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A medicine tile: illustration, name, lowest price and how close the nearest stock is.
class MedicineCard extends StatelessWidget {
  const MedicineCard({super.key, required this.group});
  final MedicineGroup group;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = group.product;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        boxShadow: AppShadows.card,
      ),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => MedicineScreen(group: group)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: 134,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Hero(
                        tag: 'medicine-art-${p.id}',
                        child: MedicineArt(
                          dosageForm: p.dosageForm,
                          seed: p.name,
                          borderRadius: 16,
                        ),
                      ),
                      if (p.requiresPrescription)
                        const Positioned(top: 8, right: 8, child: RxBadge()),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.name,
                        style: theme.textTheme.titleMedium,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 1),
                      Text(
                        '${p.strength} · ${p.dosageForm}',
                        style: theme.textTheme.bodySmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const Spacer(),
                      Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: 'from ',
                              style: theme.textTheme.bodySmall,
                            ),
                            TextSpan(
                              text: shortMoney(group.minPrice, group.currency),
                              style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(
                            group.nearestKm != null
                                ? Icons.near_me_rounded
                                : Icons.local_pharmacy_outlined,
                            size: 13,
                            color: AppColors.brand,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              [
                                if (group.nearestKm != null)
                                  formatDistance(group.nearestKm),
                                '${group.offers.length} '
                                    '${group.offers.length == 1 ? 'pharmacy' : 'pharmacies'}',
                              ].join(' · '),
                              style: theme.textTheme.labelMedium?.copyWith(
                                color: AppColors.brandDark,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
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
        ),
      ),
    );
  }
}
