import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import 'order_detail_screen.dart';

/// Opens the reserve flow for an offer, or a sign-in prompt for guests.
void showReserveSheet(BuildContext context, Offer offer) {
  final state = AppScope.read(context);
  if (!state.signedIn) {
    showModalBottomSheet<void>(
      context: context,
      builder: (sheet) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const IconTile(
              Icons.lock_person_outlined,
              size: 56,
              background: AppColors.brandSoft,
            ),
            const SizedBox(height: 16),
            Text(
              'Sign in to reserve',
              style: Theme.of(sheet).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              'A free account lets the pharmacy confirm your reservation and hold the medicine for you.',
              style: Theme.of(sheet).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 22),
            FilledButton(
              onPressed: () {
                Navigator.pop(sheet);
                Navigator.of(context).popUntil((r) => r.isFirst);
                HomeTabs.maybeOf(context)?.goTo(HomeTabs.profile);
              },
              child: const Text('Sign in or create account'),
            ),
          ],
        ),
      ),
    );
    return;
  }
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _ReserveSheet(offer: offer, parent: context),
  );
}

class _ReserveSheet extends StatefulWidget {
  const _ReserveSheet({required this.offer, required this.parent});
  final Offer offer;
  final BuildContext parent;

  @override
  State<_ReserveSheet> createState() => _ReserveSheetState();
}

class _ReserveSheetState extends State<_ReserveSheet> {
  int _qty = 1;
  final _note = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final state = AppScope.read(context);
      final order = await state.api.reserve(
        pharmacyId: widget.offer.seller.id,
        productId: widget.offer.product.id,
        quantity: _qty,
        note: _note.text.trim(),
      );
      state.ordersChanged();
      if (!mounted || !widget.parent.mounted) return;
      Navigator.pop(context);
      Navigator.of(widget.parent).push(
        MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: order.id)),
      );
    } on ApiException catch (e) {
      setState(() => _error = e.display);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final o = widget.offer;
    final max = o.available < 50 ? o.available : 50;
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
          Text('Reserve for pickup', style: theme.textTheme.titleLarge),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.field,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                const IconTile(Icons.medication_rounded, size: 44),
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
                      Text(o.seller.name, style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
                Text(
                  formatMoney(o.unitPrice, o.currency),
                  style: theme.textTheme.titleSmall,
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Packs', style: theme.textTheme.titleSmall),
                    Text(
                      '${o.available} available',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              _StepButton(
                icon: Icons.remove_rounded,
                onTap: _qty > 1 ? () => setState(() => _qty--) : null,
              ),
              SizedBox(
                width: 52,
                child: Text(
                  '$_qty',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineSmall,
                ),
              ),
              _StepButton(
                icon: Icons.add_rounded,
                onTap: _qty < max ? () => setState(() => _qty++) : null,
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _note,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              hintText: "Note for the pharmacy (optional)",
            ),
          ),
          if (o.product.requiresPrescription) ...[
            const SizedBox(height: 12),
            const Callout(
              'Prescription medicine — bring your prescription when you collect it.',
              icon: Icons.description_outlined,
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Callout(
              _error!,
              icon: Icons.error_outline_rounded,
              color: AppColors.danger,
              background: AppColors.dangerSoft,
            ),
          ],
          const SizedBox(height: 18),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    'Reserve · ${formatMoney(o.unitPrice * _qty, o.currency)}',
                  ),
          ),
          const SizedBox(height: 10),
          Text(
            'Pay at the pharmacy when you collect.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Material(
      color: enabled ? AppColors.brandSoft : AppColors.field,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: enabled ? AppColors.brand : AppColors.faint),
        ),
      ),
    );
  }
}
