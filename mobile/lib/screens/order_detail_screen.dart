import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/code.dart';
import '../api/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import 'result_screen.dart';

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  late Future<Order> _future = AppScope.read(context).api.order(widget.orderId);
  bool _cancelling = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // While the pharmacy is working on it, keep the status fresh without a manual refresh.
    _poll = Timer.periodic(const Duration(seconds: 15), (_) async {
      final current = await _future.then<Order?>(
        (o) => o,
        onError: (_) => null,
      );
      if (!mounted || current == null) return;
      if (current.status == 'pending' || current.status == 'confirmed') {
        final next = AppScope.read(context).api.order(widget.orderId);
        await next.then((o) {
          if (mounted && o.status != current.status) {
            setState(() {
              _future = Future.value(o);
            });
            AppScope.read(context).ordersChanged();
          }
        }, onError: (_) {});
      }
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _reload() async {
    final f = AppScope.read(context).api.order(widget.orderId);
    setState(() {
      _future = f;
    });
    await f.then((_) {}, onError: (_) {});
  }

  Future<void> _cancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Cancel this order?'),
        content: const Text(
          'The pharmacy will release the medicine it is holding for you.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Keep order'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Cancel order'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _cancelling = true);
    try {
      final state = AppScope.read(context);
      final o = await state.api.cancelOrder(widget.orderId);
      state.ordersChanged();
      setState(() {
        _future = Future.value(o);
      });
    } on ApiException catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Order')),
      body: FutureBuilder<Order>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return EmptyMessage(
              icon: Icons.cloud_off_rounded,
              title: "Couldn't load this order",
              body: snap.error is ApiException
                  ? (snap.error as ApiException).message
                  : null,
              action: FilledButton(
                onPressed: _reload,
                child: const Text('Try again'),
              ),
            );
          }
          final o = snap.data!;
          final (color, label) = orderStatusLook(o.status);
          final canCancel = o.status == 'pending' || o.status == 'confirmed';
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          IconTile(
                            switch (o.status) {
                              'confirmed' => Icons.inventory_2_rounded,
                              'completed' => Icons.check_circle_rounded,
                              'rejected' || 'cancelled' => Icons.cancel_rounded,
                              _ => Icons.hourglass_top_rounded,
                            },
                            color: color,
                            size: 46,
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Text(
                              label,
                              style: theme.textTheme.titleLarge?.copyWith(
                                color: color,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _statusMessage(o),
                        style: theme.textTheme.bodyMedium,
                      ),
                      if (o.status == 'pending' ||
                          o.status == 'confirmed' ||
                          o.status == 'completed') ...[
                        const SizedBox(height: 18),
                        _Progress(
                          step: switch (o.status) {
                            'confirmed' => 1,
                            'completed' => 2,
                            _ => 0,
                          },
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            o.reference,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontFamily: 'monospace',
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const Spacer(),
                          Text(
                            formatDate(o.createdAt),
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                      ),
                      const Divider(height: 24),
                      for (final it in o.items)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '${it.quantity}× ${it.name} ${it.strength}',
                                ),
                              ),
                              Text(
                                formatMoney(it.lineTotal, o.currency),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      const Divider(height: 16),
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Total — pay at pickup',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ),
                          Text(
                            formatMoney(o.total, o.currency),
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                      if (o.note.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text(
                          'Your note: ${o.note}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                SectionCard(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.storefront_outlined, color: brand),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              o.pharmacy.name,
                              style: theme.textTheme.titleSmall,
                            ),
                            if (o.pharmacy.address.isNotEmpty)
                              Text(o.pharmacy.address),
                            Text(o.pharmacy.city),
                            if (o.pharmacy.phone.isNotEmpty)
                              Text(
                                o.pharmacy.phone,
                                style: theme.textTheme.bodySmall,
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                if (o.packs.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  SectionCard(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                          child: Text(
                            'Packs you received',
                            style: theme.textTheme.titleMedium,
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: Text(
                            'Tap a pack to verify it.',
                            style: theme.textTheme.bodySmall,
                          ),
                        ),
                        for (final p in o.packs)
                          ListTile(
                            dense: true,
                            leading: const Icon(
                              Icons.verified_outlined,
                              color: brand,
                            ),
                            title: Text(
                              p.code,
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            subtitle: Text(
                              '${p.productName} · ${p.batchNumber} · exp ${formatIsoDate(p.expiresOn)}',
                            ),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) =>
                                    ResultScreen(code: normalizeCode(p.code)),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                if (canCancel) ...[
                  const SizedBox(height: 20),
                  OutlinedButton(
                    onPressed: _cancelling ? null : _cancel,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      foregroundColor: const Color(0xFFBE123C),
                    ),
                    child: const Text('Cancel order'),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  String _statusMessage(Order o) => switch (o.status) {
    'pending' =>
      '${o.pharmacy.name} will confirm that they have it and hold it for you. You\'ll get a notification.',
    'confirmed' =>
      'Go to ${o.pharmacy.name}, show reference ${o.reference}, and pay ${formatMoney(o.total, o.currency)} at the counter.'
          '${o.requiresPrescription ? ' Bring your prescription.' : ''}',
    'completed' =>
      'Collected. Each pack you received is listed below so you can verify it.',
    'rejected' =>
      o.declineReason.isEmpty
          ? 'The pharmacy declined this order.'
          : 'The pharmacy declined: ${o.declineReason}',
    'cancelled' => 'You cancelled this order.',
    _ => '',
  };
}

class _Progress extends StatelessWidget {
  const _Progress({required this.step});
  final int step;

  @override
  Widget build(BuildContext context) {
    const labels = ['Placed', 'Ready', 'Collected'];
    return Row(
      children: [
        for (var i = 0; i < 3; i++) ...[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 6,
                  decoration: BoxDecoration(
                    color: i <= step ? AppColors.brand : AppColors.line,
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  labels[i],
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: i <= step ? AppColors.ink : AppColors.faint,
                  ),
                ),
              ],
            ),
          ),
          if (i < 2) const SizedBox(width: 8),
        ],
      ],
    );
  }
}
