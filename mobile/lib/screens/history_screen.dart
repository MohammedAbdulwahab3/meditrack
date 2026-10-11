import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/code.dart';
import '../api/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import 'result_screen.dart';

/// Past checks: from the account when signed in (all devices), otherwise from this phone.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  Future<List<ScanRecord>>? _remote;
  bool? _wasSignedIn;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final state = AppScope.of(context);
    if (_wasSignedIn != state.signedIn) {
      _wasSignedIn = state.signedIn;
      _remote = state.signedIn ? state.api.myScans() : null;
    }
  }

  Future<void> _refresh() async {
    final state = AppScope.read(context);
    if (!state.signedIn) return;
    final f = state.api.myScans();
    setState(() {
      _remote = f;
    });
    await f.catchError((_) => <ScanRecord>[]);
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('History'),
        actions: [
          if (!state.signedIn && state.localHistory.isNotEmpty)
            IconButton(
              tooltip: 'Clear history',
              icon: const Icon(Icons.delete_outline),
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (c) => AlertDialog(
                    title: const Text('Clear history?'),
                    content: const Text(
                      'This removes the checks saved on this phone.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(c, false),
                        child: const Text('Cancel'),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(c, true),
                        child: const Text('Clear'),
                      ),
                    ],
                  ),
                );
                if (ok == true) await state.clearLocalHistory();
              },
            ),
        ],
      ),
      body: state.signedIn
          ? FutureBuilder<List<ScanRecord>>(
              future: _remote,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snap.hasError) {
                  final e = snap.error;
                  return EmptyMessage(
                    icon: Icons.cloud_off_rounded,
                    title: "Couldn't load your history",
                    body: e is ApiException ? e.message : null,
                    action: FilledButton(
                      onPressed: _refresh,
                      child: const Text('Try again'),
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: _refresh,
                  child: _List(
                    records: _merge(snap.data!, state.localHistory),
                    synced: true,
                  ),
                );
              },
            )
          : _List(records: state.localHistory, synced: false),
    );
  }
}

/// Account history plus checks made on this phone before signing in, without duplicates.
List<ScanRecord> _merge(List<ScanRecord> remote, List<ScanRecord> local) {
  bool sameCheck(ScanRecord a, ScanRecord b) =>
      normalizeCode(a.code) == normalizeCode(b.code) &&
      a.checkedAt.difference(b.checkedAt).inSeconds.abs() < 60;
  final merged = [
    ...remote,
    ...local.where((l) => !remote.any((r) => sameCheck(l, r))),
  ];
  merged.sort((a, b) => b.checkedAt.compareTo(a.checkedAt));
  return merged;
}

class _List extends StatelessWidget {
  const _List({required this.records, required this.synced});
  final List<ScanRecord> records;
  final bool synced;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (records.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 80),
          EmptyMessage(
            icon: Icons.history_rounded,
            title: 'No checks yet',
            body: 'Medicines you scan will appear here.',
          ),
        ],
      );
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
          child: Text(
            synced
                ? 'Your account history, plus checks made on this phone.'
                : 'Saved on this phone. Sign in to keep your history across devices.',
            style: theme.textTheme.bodySmall,
          ),
        ),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            children: [
              for (final (i, r) in records.indexed) ...[
                if (i > 0) const Divider(indent: 72),
                ListTile(
                  leading: IconTile(
                    StatusLook.of(r.result).icon,
                    color: StatusLook.of(r.result).accent,
                    size: 40,
                  ),
                  title: Text(
                    r.productName.isEmpty ? 'Unknown product' : r.productName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    '${formatCode(r.code)} · ${timeAgo(r.checkedAt)}',
                  ),
                  trailing: StatusChip(r.result),
                  onTap: () {
                    final code = normalizeCode(r.code);
                    if (isValidCode(code)) {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => ResultScreen(code: code),
                        ),
                      );
                    }
                  },
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
