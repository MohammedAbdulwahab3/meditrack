import 'package:flutter/material.dart';

import '../api/code.dart';
import '../api/models.dart';
import '../services/location.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import '../widgets/medicine_art.dart';
import 'history_screen.dart';
import 'medicine_screen.dart';
import 'medicine_search_screen.dart';
import 'pharmacy_screen.dart';
import 'report_screen.dart';
import 'result_screen.dart';
import 'scanner_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _location = LocationService.instance;
  Future<List<Pharmacy>>? _nearby;
  Future<List<Offer>>? _medicines;
  bool _medicinesNear = false;

  @override
  void initState() {
    super.initState();
    _location.addListener(_onLocation);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadMedicines();
      _location.locate();
    });
  }

  void _loadMedicines() {
    final p = _location.position;
    _medicinesNear = p != null;
    setState(() {
      // The strip shows failures itself; never let one surface as an unhandled error.
      _medicines = AppScope.read(
        context,
      ).api.offers(lat: p?.latitude, lng: p?.longitude)..ignore();
    });
  }

  @override
  void dispose() {
    _location.removeListener(_onLocation);
    super.dispose();
  }

  void _onLocation() {
    if (!mounted) return;
    final p = _location.position;
    if (p != null && !_medicinesNear) _loadMedicines();
    if (p != null && _nearby == null) {
      setState(() {
        _nearby = AppScope.read(
          context,
        ).api.pharmacies(lat: p.latitude, lng: p.longitude);
      });
    } else {
      setState(() {});
    }
  }

  void _enterCode() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => const _CodeSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final theme = Theme.of(context);
    final name = state.user?.fullName.split(' ').first;
    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          // ---- Header ----
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.brand, AppColors.brandDeep],
              ),
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
            ),
            padding: EdgeInsets.fromLTRB(
              22,
              MediaQuery.of(context).padding.top + 16,
              22,
              28,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const LogoMark(size: 34, inverted: true),
                    const SizedBox(width: 10),
                    const Text(
                      'MediTrack',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const Spacer(),
                    if (name != null)
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: Colors.white.withValues(alpha: 0.18),
                        child: Text(
                          name[0].toUpperCase(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 26),
                Text(
                  name == null ? 'Welcome' : 'Hi $name',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.75),
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Is your medicine genuine?',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.6,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Scan the QR code on the pack to see where it came from.',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.8),
                    fontSize: 14.5,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 22),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const ScannerScreen()),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.brandDark,
                      minimumSize: const Size.fromHeight(58),
                      textStyle: const TextStyle(
                        fontSize: 16.5,
                        fontWeight: FontWeight.w700,
                        fontFamily: 'Inter',
                      ),
                    ),
                    icon: const Icon(Icons.qr_code_scanner_rounded, size: 24),
                    label: const Text('Scan a medicine'),
                  ),
                ),
                const SizedBox(height: 6),
                Center(
                  child: TextButton.icon(
                    onPressed: _enterCode,
                    style: TextButton.styleFrom(foregroundColor: Colors.white),
                    icon: const Icon(Icons.keyboard_alt_outlined, size: 18),
                    label: const Text('Type a code instead'),
                  ),
                ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ---- Quick actions ----
                Row(
                  children: [
                    Expanded(
                      child: _QuickAction(
                        icon: Icons.search_rounded,
                        label: 'Find medicine',
                        hint: 'Compare prices',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const MedicineSearchScreen(),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _QuickAction(
                        icon: Icons.near_me_rounded,
                        label: 'Nearby',
                        hint: 'Pharmacies & map',
                        onTap: () =>
                            HomeTabs.maybeOf(context)?.goTo(HomeTabs.nearby),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _QuickAction(
                        icon: Icons.flag_rounded,
                        label: 'Report a fake',
                        hint: 'Tell us',
                        color: AppColors.danger,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const ReportScreen(),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _QuickAction(
                        icon: Icons.history_rounded,
                        label: 'History',
                        hint: 'Past checks',
                        color: AppColors.info,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const HistoryScreen(),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                // ---- Medicines ----
                const SizedBox(height: 28),
                SectionHeader(
                  _medicinesNear ? 'Medicines near you' : 'Medicines in stock',
                  action: 'See all',
                  onAction: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const MedicineSearchScreen(),
                    ),
                  ),
                ),
                _MedicineStrip(future: _medicines),

                // ---- Nearby pharmacies ----
                const SizedBox(height: 28),
                SectionHeader(
                  'Pharmacies near you',
                  action: 'See all',
                  onAction: () =>
                      HomeTabs.maybeOf(context)?.goTo(HomeTabs.nearby),
                ),
                _NearbyStrip(future: _nearby, location: _location),

                // ---- Recent checks ----
                if (state.localHistory.isNotEmpty) ...[
                  const SizedBox(height: 28),
                  SectionHeader(
                    'Recent checks',
                    action: 'See all',
                    onAction: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const HistoryScreen()),
                    ),
                  ),
                  AppCard(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      children: [
                        for (final (i, r)
                            in state.localHistory.take(3).indexed) ...[
                          if (i > 0) const Divider(indent: 72),
                          ListTile(
                            leading: IconTile(
                              StatusLook.of(r.result).icon,
                              color: StatusLook.of(r.result).accent,
                              size: 40,
                            ),
                            title: Text(
                              r.productName.isEmpty
                                  ? 'Unknown product'
                                  : r.productName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(
                              '${formatCode(r.code)} · ${timeAgo(r.checkedAt)}',
                            ),
                            trailing: const Icon(
                              Icons.chevron_right_rounded,
                              color: AppColors.faint,
                            ),
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) =>
                                    ResultScreen(code: normalizeCode(r.code)),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                Text(
                  'Free and anonymous. Each check helps spot copied labels.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.hint,
    required this.onTap,
    this.color = AppColors.brand,
  });
  final IconData icon;
  final String label, hint;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconTile(icon, color: color, size: 42),
          const SizedBox(height: 14),
          Text(
            label,
            style: Theme.of(context).textTheme.titleSmall,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            hint,
            style: Theme.of(context).textTheme.bodySmall,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _MedicineStrip extends StatelessWidget {
  const _MedicineStrip({required this.future});
  final Future<List<Offer>>? future;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return FutureBuilder<List<Offer>>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const SizedBox(
            height: 196,
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snap.hasError) {
          return const AppCard(
            child: Text("Couldn't load medicines right now."),
          );
        }
        final groups = groupOffers(snap.data!).take(10).toList();
        if (groups.isEmpty) {
          return const AppCard(child: Text('No medicines listed yet.'));
        }
        return SizedBox(
          height: 196 * MediaQuery.textScalerOf(context).scale(1).clamp(1, 1.1),
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: groups.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, i) {
              final g = groups[i];
              final p = g.product;
              return SizedBox(
                width: 148,
                child: AppCard(
                  padding: const EdgeInsets.all(8),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => MedicineScreen(group: g)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        height: 104,
                        width: double.infinity,
                        child: Hero(
                          tag: 'medicine-art-${p.id}',
                          child: MedicineArt(
                            dosageForm: p.dosageForm,
                            seed: p.name + p.genericName,
                            borderRadius: 14,
                          ),
                        ),
                      ),
                      const Spacer(),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              p.name,
                              style: theme.textTheme.titleSmall,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              p.strength,
                              style: theme.textTheme.bodySmall,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'from ${shortMoney(g.minPrice, g.currency)}',
                              style: theme.textTheme.labelMedium?.copyWith(
                                color: AppColors.brandDark,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 4),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _NearbyStrip extends StatelessWidget {
  const _NearbyStrip({required this.future, required this.location});
  final Future<List<Pharmacy>>? future;
  final LocationService location;

  @override
  Widget build(BuildContext context) {
    if (future == null) {
      final problem = location.problem;
      return AppCard(
        child: Row(
          children: [
            const IconTile(Icons.location_searching_rounded),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                location.status == LocationStatus.locating ||
                        location.status == LocationStatus.unknown
                    ? 'Finding your location…'
                    : problem.isEmpty
                    ? 'Turn on location to see the closest pharmacies.'
                    : problem,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
            if (location.status != LocationStatus.locating &&
                location.status != LocationStatus.unknown)
              TextButton(
                onPressed: () =>
                    location.status == LocationStatus.deniedForever ||
                        location.status == LocationStatus.serviceOff
                    ? location.openSettings()
                    : location.locate(force: true),
                child: const Text('Enable'),
              ),
          ],
        ),
      );
    }
    return FutureBuilder<List<Pharmacy>>(
      future: future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const SizedBox(
            height: 132,
            child: Center(child: CircularProgressIndicator()),
          );
        }
        final list = (snap.data ?? [])
            .where((p) => p.distanceKm != null)
            .take(5)
            .toList();
        if (list.isEmpty) {
          return const AppCard(
            child: Text('No pharmacies with a map location yet.'),
          );
        }
        return SizedBox(
          height: 138,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, i) {
              final p = list[i];
              return SizedBox(
                width: 210,
                child: AppCard(
                  padding: const EdgeInsets.all(14),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PharmacyScreen(pharmacy: p),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const IconTile(
                            Icons.local_pharmacy_rounded,
                            size: 36,
                          ),
                          const Spacer(),
                          Pill(
                            formatDistance(p.distanceKm),
                            color: AppColors.brand,
                            icon: Icons.near_me_rounded,
                          ),
                        ],
                      ),
                      const Spacer(),
                      Text(
                        p.name,
                        style: Theme.of(context).textTheme.titleSmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${p.productsInStock} medicines in stock',
                        style: Theme.of(context).textTheme.bodySmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _CodeSheet extends StatefulWidget {
  const _CodeSheet();

  @override
  State<_CodeSheet> createState() => _CodeSheetState();
}

class _CodeSheetState extends State<_CodeSheet> {
  final _code = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _check() {
    final code = normalizeCode(_code.text);
    if (!isValidCode(code)) {
      setState(() => _error = 'Codes have 12 characters, like ABCD-EFGH-JKMN.');
      return;
    }
    final nav = Navigator.of(context);
    nav.pop();
    nav.push(MaterialPageRoute(builder: (_) => ResultScreen(code: code)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        24,
        0,
        24,
        24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Enter the pack code', style: theme.textTheme.titleLarge),
          const SizedBox(height: 6),
          Text(
            'It is printed under the QR code on the box.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 18),
          TextField(
            controller: _code,
            autofocus: true,
            textCapitalization: TextCapitalization.characters,
            autocorrect: false,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              letterSpacing: 2,
            ),
            decoration: InputDecoration(
              hintText: 'ABCD-EFGH-JKMN',
              errorText: _error,
              hintStyle: const TextStyle(
                fontSize: 20,
                letterSpacing: 2,
                color: AppColors.faint,
                fontWeight: FontWeight.w500,
              ),
            ),
            onSubmitted: (_) => _check(),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _check, child: const Text('Check this pack')),
        ],
      ),
    );
  }
}
