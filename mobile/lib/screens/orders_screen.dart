import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
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
                      return AppCard(
                        padding: const EdgeInsets.all(16),
                        onTap: () async {
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => OrderDetailScreen(orderId: o.id),
                            ),
                          );
                          if (mounted) _refresh();
                        },
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const IconTile(
                                  Icons.storefront_rounded,
                                  size: 40,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        o.pharmacy.name,
                                        style: Theme.of(
                                          context,
                                        ).textTheme.titleSmall,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      Text(
                                        '${o.reference} · ${o.createdAt == null ? '' : timeAgo(o.createdAt!)}',
                                        style: Theme.of(
                                          context,
                                        ).textTheme.bodySmall,
                                      ),
                                    ],
                                  ),
                                ),
                                OrderStatusChip(o.status),
                              ],
                            ),
                            const SizedBox(height: 12),
                            const Divider(),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    o.items
                                        .map(
                                          (it) =>
                                              '${it.quantity}× ${it.name} ${it.strength}',
                                        )
                                        .join(', '),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.bodyMedium,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Text(
                                  formatMoney(o.total, o.currency),
                                  style: Theme.of(context).textTheme.titleSmall,
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
              ),
            ),
    );
  }
}
