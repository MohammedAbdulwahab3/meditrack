import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/code.dart';
import '../api/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import 'report_screen.dart';
import 'scanner_screen.dart';

/// Checks one pack code with the server and shows the verdict and journey.
class ResultScreen extends StatefulWidget {
  const ResultScreen({super.key, required this.code});
  final String code;

  @override
  State<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends State<ResultScreen> {
  // Each verification is recorded by the server, so fetch exactly once per screen.
  late final Future<VerifyResult> _future = _verify();

  Future<VerifyResult> _verify() async {
    final state = AppScope.read(context);
    final result = await state.api.verify(widget.code);
    await state.remember(result);
    return result;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<VerifyResult>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return Scaffold(
            appBar: AppBar(),
            body: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 18),
                  Text(
                    'Checking ${formatCode(widget.code)}…',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          );
        }
        if (snap.hasError) {
          final e = snap.error;
          return Scaffold(
            appBar: AppBar(),
            body: EmptyMessage(
              icon: Icons.cloud_off_rounded,
              title: "Couldn't check this pack",
              body: e is ApiException
                  ? e.message
                  : 'Something went wrong. Please try again.',
              action: FilledButton(
                onPressed: () => Navigator.of(context).pushReplacement(
                  MaterialPageRoute(
                    builder: (_) => ResultScreen(code: widget.code),
                  ),
                ),
                child: const Text('Try again'),
              ),
            ),
          );
        }
        return _ResultView(result: snap.data!);
      },
    );
  }
}

class _ResultView extends StatelessWidget {
  const _ResultView({required this.result});
  final VerifyResult result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final look = StatusLook.of(result.status);
    final r = result;
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          // ---- Verdict ----
          Container(
            padding: EdgeInsets.fromLTRB(20, top + 8, 20, 28),
            decoration: BoxDecoration(
              color: look.background,
              borderRadius: const BorderRadius.vertical(
                bottom: Radius.circular(32),
              ),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: Icon(
                        Icons.arrow_back_rounded,
                        color: look.foreground,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      r.code,
                      style: TextStyle(
                        color: look.foreground,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1,
                      ),
                    ),
                    const Spacer(),
                    const SizedBox(width: 48),
                  ],
                ),
                const SizedBox(height: 14),
                Container(
                  width: 92,
                  height: 92,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: look.accent.withValues(alpha: 0.25),
                        blurRadius: 30,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Icon(look.icon, size: 54, color: look.accent),
                ),
                const SizedBox(height: 18),
                Text(
                  r.headline,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    color: look.foreground,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  r.message,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: look.foreground,
                  ),
                ),
                if (r.status == 'recalled' && r.recallReason != null) ...[
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.75),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      'Recall reason: ${r.recallReason}',
                      style: TextStyle(
                        color: look.foreground,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (r.product != null) ...[
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const IconTile(Icons.medication_rounded, size: 48),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${r.product!.name} ${r.product!.strength}',
                                    style: theme.textTheme.titleLarge,
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    [
                                      r.product!.genericName,
                                      r.product!.dosageForm,
                                      if (r.product!.packSize.isNotEmpty)
                                        r.product!.packSize,
                                    ].join(' · '),
                                    style: theme.textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (r.product!.requiresPrescription) ...[
                          const SizedBox(height: 12),
                          const Pill(
                            'Prescription medicine',
                            color: AppColors.info,
                            icon: Icons.description_outlined,
                          ),
                        ],
                        const SizedBox(height: 14),
                        _Row(
                          'Manufacturer',
                          r.manufacturer == null
                              ? null
                              : '${r.manufacturer!.name}, ${r.manufacturer!.country}',
                        ),
                        _Row('Batch', r.batchNumber),
                        _Row('Manufactured', formatIsoDate(r.manufacturedOn)),
                        _Row('Expires', formatIsoDate(r.expiresOn)),
                        if (r.dispensedBy != null)
                          _Row(
                            'Sold by',
                            '${r.dispensedBy!.name}, ${r.dispensedBy!.city}\n${formatDate(r.dispensedAt)}',
                          )
                        else if (r.currentHolder != null)
                          _Row(
                            r.unitState == 'in_transit'
                                ? 'Shipped by'
                                : 'Held by',
                            '${r.currentHolder!.name}, ${r.currentHolder!.city}',
                          ),
                      ],
                    ),
                  ),
                  if (r.dispensedBy == null &&
                      r.currentHolder?.type == 'pharmacy') ...[
                    const SizedBox(height: 12),
                    Callout(
                      'This pack is recorded at ${r.currentHolder!.name}. If you bought it somewhere else, ask the seller where it came from.',
                    ),
                  ],
                ],
                if (r.journey.isNotEmpty) ...[
                  const SizedBox(height: 22),
                  const SectionHeader('Supply chain journey'),
                  AppCard(
                    child: Column(
                      children: [
                        for (var i = 0; i < r.journey.length; i++)
                          _JourneyTile(
                            step: r.journey[i],
                            last: i == r.journey.length - 1,
                          ),
                      ],
                    ),
                  ),
                ],
                if (r.status != 'not_found') ...[
                  const SizedBox(height: 16),
                  Text(
                    r.previousChecks == 0
                        ? 'First time this pack has been checked.'
                        : 'Checked ${r.previousChecks} time${r.previousChecks == 1 ? '' : 's'} before'
                              '${r.firstCheckedAt != null ? ', first on ${formatDate(r.firstCheckedAt)}' : ''}.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall,
                  ),
                ],
                const SizedBox(height: 22),
                FilledButton.icon(
                  onPressed: () => Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (_) => const ScannerScreen()),
                  ),
                  icon: const Icon(Icons.qr_code_scanner_rounded),
                  label: const Text('Scan another pack'),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ReportScreen(
                        initialCode: r.code,
                        initialProduct: r.product == null
                            ? ''
                            : '${r.product!.name} ${r.product!.strength}',
                      ),
                    ),
                  ),
                  icon: const Icon(Icons.flag_outlined),
                  label: const Text('Report a problem'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: r.status == 'genuine'
                        ? AppColors.ink
                        : AppColors.danger,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    if (value == null || value!.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(
              label,
              style: const TextStyle(color: AppColors.muted, fontSize: 14),
            ),
          ),
          Expanded(
            child: Text(
              value!,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _JourneyTile extends StatelessWidget {
  const _JourneyTile({required this.step, required this.last});
  final JourneyStep step;
  final bool last;

  static const _icons = {
    'manufactured': Icons.factory_outlined,
    'shipped': Icons.local_shipping_outlined,
    'received': Icons.inventory_2_outlined,
    'returned': Icons.undo_rounded,
    'dispensed': Icons.storefront_outlined,
  };

  String get _label => switch (step.kind) {
    'manufactured' => 'Manufactured',
    'shipped' => 'Shipped to ${step.to?.name ?? 'partner'}',
    'received' => 'Received',
    'returned' => 'Rejected and returned',
    'dispensed' => 'Sold to a patient',
    _ => capitalize(step.kind),
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: const BoxDecoration(
                  color: AppColors.brandSoft,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  _icons[step.kind] ?? Icons.circle_outlined,
                  size: 18,
                  color: AppColors.brand,
                ),
              ),
              if (!last)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    color: AppColors.brandSoft,
                  ),
                ),
            ],
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : 18, top: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_label, style: theme.textTheme.titleSmall),
                  const SizedBox(height: 2),
                  Text(
                    '${step.org.name} · ${step.org.city}',
                    style: theme.textTheme.bodySmall,
                  ),
                  Text(
                    formatDateTime(step.at),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: AppColors.faint,
                      letterSpacing: 0,
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
