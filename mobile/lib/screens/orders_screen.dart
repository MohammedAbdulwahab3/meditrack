import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import '../widgets/medicine_art.dart';
import 'order_detail_screen.dart';

/// The patient's pickup reservations.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  Future<List<Order>>? _future;
  bool? _wasSignedIn;
  int _seenVersion = -1;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final state = AppScope.of(context);
    if (_wasSignedIn != state.signedIn || _seenVersion != state.ordersVersion) {
      _wasSignedIn = state.signedIn;
      _seenVersion = state.ordersVersion;
      _future = state.signedIn ? state.api.myOrders() : null;
    }
  }

  Future<void> _refresh() async {
    final f = AppScope.read(context).api.myOrders();
    setState(() {
      _future = f;
    });
    await f.catchError((_) => <Order>[]);
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('My orders')),
      body: !state.signedIn
          ? EmptyMessage(
              icon: Icons.receipt_long_outlined,
              title: 'Sign in to see your orders',
              body: 'Reserve medicine at a pharmacy and pay when you collect.',
              action: FilledButton(
                onPressed: () =>
                    HomeTabs.maybeOf(context)?.goTo(HomeTabs.profile),
                child: const Text('Sign in'),
              ),
            )
          : RefreshIndicator(
              onRefresh: _refresh,
              child: FutureBuilder<List<Order>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snap.hasError) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        EmptyMessage(
                          icon: Icons.cloud_off_rounded,
                          title: "Couldn't load your orders",
                          body: snap.error is ApiException
                              ? (snap.error as ApiException).message
                              : null,
                        ),
                      ],
                    );
                  }
                  final orders = snap.data!;
                  if (orders.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        const SizedBox(height: 60),
                        EmptyMessage(
                          icon: Icons.receipt_long_outlined,
                          title: 'No orders yet',
                          body:
                              'Find a medicine and reserve it at a pharmacy near you.',
                          action: FilledButton(
                            onPressed: () => HomeTabs.maybeOf(
                              context,
                            )?.goTo(HomeTabs.nearby),
                            child: const Text('Find medicine'),
                          ),
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: orders.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, i) {
                      final o = orders[i];
                      return OrderCard(
                        order: o,
                        onTap: () async {
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => OrderDetailScreen(orderId: o.id),
                            ),
                          );
                          if (mounted) _refresh();
                        },
                      );
                    },
                  );
                },
              ),
            ),
    );
  }
}

/// A reservation at a glance: what, where, status and total.
class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.order, required this.onTap});
  final Order order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final o = order;
    final first = o.items.isEmpty ? null : o.items.first;
    final more = o.items.length - 1;
    return AppCard(
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 64,
                height: 64,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    first == null
                        ? const IconTile(Icons.medication_rounded, size: 64)
                        : MedicineArt(
                            dosageForm: first.dosageForm,
                            seed: first.name + first.genericName,
                            borderRadius: 16,
                          ),
                    if (more > 0)
                      Positioned(
                        right: 4,
                        bottom: 4,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.ink,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '+$more',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      o.items
                          .map((it) => '${it.name} ${it.strength}')
                          .join(', '),
                      style: theme.textTheme.titleSmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        const Icon(
                          Icons.storefront_rounded,
                          size: 14,
                          color: AppColors.muted,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            o.pharmacy.name,
                            style: theme.textTheme.bodySmall,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    OrderStatusChip(o.status),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  [
                    o.reference,
                    if (o.createdAt != null) timeAgo(o.createdAt!),
                  ].join(' · '),
                  style: theme.textTheme.bodySmall,
                ),
              ),
              Text(
                formatMoney(o.total, o.currency),
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
