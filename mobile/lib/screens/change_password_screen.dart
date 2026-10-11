import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';

/// Change the account password. With [forced], it is shown after an admin reset and can't be
/// skipped: the user enters the temporary password and picks their own.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key, this.forced = false});
  final bool forced;

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _repeat = TextEditingController();
  bool _show = false;
  bool _busy = false;
  Map<String, String> _errors = {};
  String? _error;

  @override
  void dispose() {
    for (final c in [_current, _next, _repeat]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final current = widget.forced
        ? _current.text.trim().toUpperCase()
        : _current.text;
    setState(() {
      _errors = {};
      _error = null;
    });
    if (_next.text != _repeat.text) {
      setState(() => _errors = {'repeat': "The passwords don't match."});
      return;
    }
    setState(() => _busy = true);
    try {
      await AppScope.read(context).changePassword(current, _next.text);
      if (!mounted) return;
      if (!widget.forced) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Password changed. Other devices were signed out.'),
          ),
        );
      }
    } on ApiException catch (e) {
      setState(() {
        _errors = e.fields;
        if (e.fields.isEmpty) _error = e.message;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  InputDecoration _deco(String label, String key, {String? hint}) =>
      InputDecoration(
        labelText: label,
        hintText: hint,
        errorText: _errors[key],
        prefixIcon: const Icon(Icons.lock_outline_rounded),
        suffixIcon: IconButton(
          tooltip: _show ? 'Hide' : 'Show',
          icon: Icon(
            _show ? Icons.visibility_off_outlined : Icons.visibility_outlined,
          ),
          onPressed: () => setState(() => _show = !_show),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = AppScope.of(context);
    return PopScope(
      canPop: !widget.forced,
      child: Scaffold(
        appBar: widget.forced
            ? null
            : AppBar(title: const Text('Change password')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
            children: [
              if (widget.forced) ...[
                const Align(
                  alignment: Alignment.centerLeft,
                  child: IconTile(Icons.key_rounded, size: 56),
                ),
                const SizedBox(height: 18),
                Text(
                  'Choose a new password',
                  style: theme.textTheme.headlineMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  'An administrator reset the password for ${state.user?.email ?? 'your account'}. '
                  'Enter the temporary password you were given, then pick your own.',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 24),
              ],
              TextField(
                controller: _current,
                obscureText: !_show && !widget.forced,
                autocorrect: false,
                enableSuggestions: false,
                textCapitalization: widget.forced
                    ? TextCapitalization.characters
                    : TextCapitalization.none,
                decoration: _deco(
                  widget.forced ? 'Temporary password' : 'Current password',
                  'current_password',
                  hint: widget.forced ? 'XXXX-XXXX-XXXX' : null,
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _next,
                obscureText: !_show,
                autocorrect: false,
                enableSuggestions: false,
                autofillHints: const [AutofillHints.newPassword],
                decoration: _deco(
                  'New password (8+ characters)',
                  'new_password',
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _repeat,
                obscureText: !_show,
                autocorrect: false,
                enableSuggestions: false,
                decoration: _deco('Repeat new password', 'repeat'),
                onSubmitted: (_) => _save(),
              ),
              if (_error != null) ...[
                const SizedBox(height: 14),
                Callout(
                  _error!,
                  color: AppColors.danger,
                  background: AppColors.dangerSoft,
                  icon: Icons.error_outline_rounded,
                ),
              ],
              const SizedBox(height: 22),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : Text(
                        widget.forced ? 'Save and continue' : 'Change password',
                      ),
              ),
              if (widget.forced) ...[
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => state.signOut(),
                  child: const Text('Sign out'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
