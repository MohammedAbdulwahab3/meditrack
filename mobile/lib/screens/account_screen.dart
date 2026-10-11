import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import 'history_screen.dart';
import 'report_screen.dart';

/// Profile tab: optional patient account, reports, history, settings.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: state.signedIn ? const _SignedIn() : const _SignedOut(),
    );
  }
}

class _SignedOut extends StatefulWidget {
  const _SignedOut();

  @override
  State<_SignedOut> createState() => _SignedOutState();
}

class _SignedOutState extends State<_SignedOut> {
  bool _register = false;
  bool _busy = false;
  bool _showPassword = false;
  Map<String, String> _errors = {};
  String? _message;
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _errors = {};
      _message = null;
    });
    final state = AppScope.read(context);
    try {
      if (_register) {
        await state.register(
          fullName: _name.text,
          email: _email.text,
          phone: _phone.text,
          password: _password.text,
        );
      } else {
        await state.signIn(_email.text, _password.text);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _errors = e.fields;
          _message = e.fields.isEmpty ? e.message : null;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    InputDecoration deco(
      String hint,
      String key,
      IconData icon, {
      Widget? suffix,
    }) => InputDecoration(
      hintText: hint,
      errorText: _errors[key],
      prefixIcon: Icon(icon),
      suffixIcon: suffix,
    );
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        AppCard(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Align(
                alignment: Alignment.centerLeft,
                child: IconTile(Icons.person_rounded, size: 52),
              ),
              const SizedBox(height: 14),
              Text(
                _register ? 'Create your account' : 'Welcome back',
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: 6),
              Text(
                'Optional — it lets you reserve medicine, keep your history across phones, and get replies to your reports.',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 20),
              SegmentedButton<bool>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: false, label: Text('Sign in')),
                  ButtonSegment(value: true, label: Text('Create account')),
                ],
                selected: {_register},
                onSelectionChanged: (s) => setState(() {
                  _register = s.first;
                  _errors = {};
                  _message = null;
                }),
              ),
              const SizedBox(height: 18),
              AutofillGroup(
                child: Column(
                  children: [
                    if (_register) ...[
                      TextField(
                        controller: _name,
                        textCapitalization: TextCapitalization.words,
                        decoration: deco(
                          'Full name',
                          'full_name',
                          Icons.badge_outlined,
                        ),
                        autofillHints: const [AutofillHints.name],
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: deco(
                        'Email',
                        'email',
                        Icons.mail_outline_rounded,
                      ),
                      autofillHints: const [AutofillHints.email],
                    ),
                    const SizedBox(height: 12),
                    if (_register) ...[
                      TextField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: deco(
                          'Phone (optional)',
                          'phone',
                          Icons.phone_outlined,
                        ),
                        autofillHints: const [AutofillHints.telephoneNumber],
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      controller: _password,
                      obscureText: !_showPassword,
                      decoration: deco(
                        _register ? 'Password (8+ characters)' : 'Password',
                        'password',
                        Icons.lock_outline_rounded,
                        suffix: IconButton(
                          icon: Icon(
                            _showPassword
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                          ),
                          onPressed: () =>
                              setState(() => _showPassword = !_showPassword),
                        ),
                      ),
                      autofillHints: [
                        _register
                            ? AutofillHints.newPassword
                            : AutofillHints.password,
                      ],
                      onSubmitted: (_) => _submit(),
                    ),
                  ],
                ),
              ),
              if (_message != null) ...[
                const SizedBox(height: 14),
                Callout(
                  _message!,
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
                    : Text(_register ? 'Create account' : 'Sign in'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const _Menu(),
      ],
    );
  }
}

class _SignedIn extends StatefulWidget {
  const _SignedIn();

  @override
  State<_SignedIn> createState() => _SignedInState();
}

class _SignedInState extends State<_SignedIn> {
  late Future<List<Report>> _reports = AppScope.read(context).api.myReports();

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final user = state.user!;
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: () async {
        final f = state.api.myReports();
        setState(() {
          _reports = f;
        });
        await f.then((_) {}, onError: (_) {});
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.brand, AppColors.brandDeep],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Colors.white,
                  child: Text(
                    user.fullName.isEmpty
                        ? '?'
                        : user.fullName[0].toUpperCase(),
                    style: const TextStyle(
                      color: AppColors.brand,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.fullName,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        user.email,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.8),
                          fontSize: 13.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const _Menu(),
          const SizedBox(height: 24),
          const SectionHeader('My reports'),
          FutureBuilder<List<Report>>(
            future: _reports,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snap.hasError) {
                return Text(
                  snap.error is ApiException
                      ? (snap.error as ApiException).message
                      : "Couldn't load reports.",
                );
              }
              final reports = snap.data!;
              if (reports.isEmpty) {
                return AppCard(
                  child: Text(
                    "You haven't reported anything.",
                    style: theme.textTheme.bodyMedium,
                  ),
                );
              }
              return Column(
                children: [
                  for (final r in reports)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _ReportCard(report: r),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => state.signOut(),
            icon: const Icon(Icons.logout_rounded),
            label: const Text('Sign out'),
            style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
          ),
        ],
      ),
    );
  }
}

/// Shortcuts shared by signed-in and signed-out profiles.
class _Menu extends StatelessWidget {
  const _Menu();

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    Widget tile(
      IconData icon,
      String title,
      String? subtitle,
      VoidCallback onTap, {
      Color color = AppColors.brand,
    }) => ListTile(
      leading: IconTile(icon, size: 38, color: color),
      title: Text(title),
      subtitle: subtitle == null
          ? null
          : Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
      onTap: onTap,
    );
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        children: [
          if (state.signedIn) ...[
            tile(
              Icons.receipt_long_rounded,
              'My orders',
              'Reservations and pickups',
              () => HomeTabs.maybeOf(context)?.goTo(HomeTabs.orders),
            ),
            const Divider(indent: 70),
          ],
          tile(
            Icons.history_rounded,
            'Scan history',
            '${state.localHistory.length} checks on this phone',
            () => Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const HistoryScreen())),
            color: AppColors.info,
          ),
          const Divider(indent: 70),
          tile(
            Icons.flag_rounded,
            'Report a fake',
            'Tell us about a suspicious medicine',
            () => Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const ReportScreen())),
            color: AppColors.danger,
          ),
          const Divider(indent: 70),
          tile(
            Icons.dns_rounded,
            'Server',
            state.serverUrl,
            () => _editServer(context, state),
            color: AppColors.muted,
          ),
        ],
      ),
    );
  }

  Future<void> _editServer(BuildContext context, AppState state) async {
    final controller = TextEditingController(text: state.serverUrl);
    final url = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('MediTrack server'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: controller,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(
                hintText: 'https://meditrack.example.com',
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Changing the server signs you out.',
              style: TextStyle(fontSize: 12.5, color: AppColors.muted),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, ''),
            child: const Text('Reset'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (url != null) await state.setServerUrl(url);
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.report});
  final Report report;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (color, label) = switch (report.status) {
      'investigating' => (AppColors.info, 'Investigating'),
      'closed' => (AppColors.muted, 'Closed'),
      _ => (AppColors.warning, 'Open'),
    };
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  report.productName.isEmpty
                      ? 'Unnamed product'
                      : report.productName,
                  style: theme.textTheme.titleSmall,
                ),
              ),
              Pill(label, color: color),
            ],
          ),
          const SizedBox(height: 2),
          Text(formatDate(report.createdAt), style: theme.textTheme.bodySmall),
          const SizedBox(height: 8),
          Text(report.description, style: theme.textTheme.bodyMedium),
          if (report.adminNote.isNotEmpty) ...[
            const SizedBox(height: 10),
            Callout(
              'MediTrack team: ${report.adminNote}',
              icon: Icons.support_agent_rounded,
            ),
          ],
        ],
      ),
    );
  }
}
