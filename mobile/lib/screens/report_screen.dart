import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';

/// Report a suspicious medicine. Works without an account; signed-in reports get follow-up.
class ReportScreen extends StatefulWidget {
  const ReportScreen({
    super.key,
    this.initialCode = '',
    this.initialProduct = '',
    this.isTab = false,
  });
  final String initialCode;
  final String initialProduct;
  final bool isTab;

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  final _form = GlobalKey<FormState>();
  late final _code = TextEditingController(text: widget.initialCode);
  late final _product = TextEditingController(text: widget.initialProduct);
  final _place = TextEditingController();
  final _contact = TextEditingController();
  final _description = TextEditingController();
  bool _sending = false;
  bool _sent = false;
  Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    for (final c in [_code, _product, _place, _contact, _description]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _sending = true;
      _fieldErrors = {};
    });
    try {
      await AppScope.read(context).api.report(
        code: _code.text,
        productName: _product.text,
        place: _place.text,
        contact: _contact.text,
        description: _description.text,
      );
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _fieldErrors = e.fields);
      if (e.fields.isEmpty) showError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _reset() {
    for (final c in [_code, _product, _place, _contact, _description]) {
      c.clear();
    }
    setState(() => _sent = false);
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = AppScope.of(context).signedIn;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Report a fake')),
      body: _sent
          ? EmptyMessage(
              icon: Icons.check_circle_outline_rounded,
              title: 'Thank you — report received',
              body: signedIn
                  ? 'Our team reviews every report. You can follow it under Account → My reports.'
                  : 'Our team reviews every report. If you left contact details, we may get in touch.',
              action: widget.isTab
                  ? OutlinedButton(
                      onPressed: _reset,
                      child: const Text('Send another report'),
                    )
                  : FilledButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Done'),
                    ),
            )
          : Form(
              key: _form,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  Text(
                    'Tell us about a medicine that looks wrong. Reports go straight to the MediTrack team.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _field(
                    _code,
                    'Pack code (if there is one)',
                    hint: 'ABCD-EFGH-JKMN',
                    caps: true,
                  ),
                  _field(
                    _product,
                    'Medicine name',
                    hint: 'e.g. Amoxicillin 500 mg',
                  ),
                  _field(
                    _place,
                    'Where did you get it?',
                    hint: 'Pharmacy name, area, city',
                  ),
                  _field(
                    _description,
                    'What looked wrong?',
                    hint:
                        'Broken seal, different colour or taste, misspelled packaging, no QR code…',
                    lines: 4,
                    error: _fieldErrors['description'],
                    validator: (v) => (v ?? '').trim().length < 10
                        ? 'Please describe it in at least 10 characters.'
                        : null,
                  ),
                  if (!signedIn)
                    _field(
                      _contact,
                      'Phone or email (optional)',
                      hint: 'Only used if we need more details',
                    ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: _sending ? null : _submit,
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send_rounded),
                    label: const Text('Send report'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                      backgroundColor: const Color(0xFFE11D48),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _field(
    TextEditingController c,
    String label, {
    String? hint,
    int lines = 1,
    bool caps = false,
    String? error,
    String? Function(String?)? validator,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextFormField(
      controller: c,
      minLines: lines,
      maxLines: lines == 1 ? 1 : 8,
      textCapitalization: caps
          ? TextCapitalization.characters
          : TextCapitalization.sentences,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        errorText: error,
        alignLabelWithHint: lines > 1,
      ),
    ),
  );
}
