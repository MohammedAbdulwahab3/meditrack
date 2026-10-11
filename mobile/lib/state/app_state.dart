import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../api/models.dart';

/// Default server. Override at build time:
///   flutter run --dart-define=API_URL=https://meditrack.example.com
/// The Android emulator reaches the host machine at 10.0.2.2.
const defaultServerUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://10.0.2.2:8090',
);

const _kServerUrl = 'server_url';
const _kHistory = 'scan_history';
const _kToken = 'session_token';
const _maxHistory = 200;

/// App-wide state: which server to talk to, the optional patient session, and the
/// on-device scan history (kept even without an account).
class AppState extends ChangeNotifier {
  AppState(this._prefs, this._secure);

  final SharedPreferences _prefs;
  final FlutterSecureStorage _secure;

  String serverUrl = defaultServerUrl;
  String? _token;
  UserProfile? user;
  List<ScanRecord> localHistory = [];

  /// Bumped whenever the patient's orders change, so the Orders tab reloads.
  int ordersVersion = 0;
  void ordersChanged() {
    ordersVersion++;
    notifyListeners();
  }

  bool get signedIn => _token != null && user != null;
  ApiClient get api => ApiClient(baseUrl: serverUrl, token: _token);

  static Future<AppState> load() async {
    final state = AppState(
      await SharedPreferences.getInstance(),
      const FlutterSecureStorage(),
    );
    await state._restore();
    return state;
  }

  Future<void> _restore() async {
    serverUrl = _prefs.getString(_kServerUrl) ?? defaultServerUrl;
    final raw = _prefs.getString(_kHistory);
    if (raw != null) {
      try {
        localHistory = (jsonDecode(raw) as List)
            .map((e) => ScanRecord.fromJson(e))
            .toList();
      } catch (_) {
        localHistory = [];
      }
    }
    try {
      _token = await _secure.read(key: _kToken);
    } catch (_) {
      // After a reinstall Android may be unable to decrypt the old session; start signed out.
      _token = null;
      await _secure.deleteAll().catchError((_) {});
    }
    if (_token != null) {
      try {
        user = await api.me();
      } on ApiException catch (e) {
        // An expired or revoked session: forget it. Network errors keep the token for later.
        if (e.status == 401) await _clearSession();
      }
    }
  }

  Future<void> setServerUrl(String url) async {
    serverUrl = url.trim().isEmpty ? defaultServerUrl : url.trim();
    await _prefs.setString(_kServerUrl, serverUrl);
    await _clearSession(); // a session belongs to one server
    notifyListeners();
  }

  /// Signs in. Only patient accounts belong in this app; business staff use the web dashboard.
  Future<void> signIn(String email, String password) async {
    final (token, profile) = await api.login(email, password);
    await _adopt(token, profile);
  }

  Future<void> register({
    required String fullName,
    required String email,
    required String phone,
    required String password,
  }) async {
    final (token, profile) = await api.registerPatient(
      fullName: fullName,
      email: email,
      phone: phone,
      password: password,
    );
    await _adopt(token, profile);
  }

  Future<void> _adopt(String token, UserProfile profile) async {
    if (profile.role != 'patient') {
      await ApiClient(
        baseUrl: serverUrl,
        token: token,
      ).logout().catchError((_) {});
      throw const ApiException(
        403,
        'wrong_app',
        'This is a business account. Please use the MediTrack web dashboard to manage your organization.',
      );
    }
    _token = token;
    user = profile;
    try {
      await _secure.write(key: _kToken, value: token);
    } catch (_) {
      // Storage unavailable: stay signed in for this session only.
    }
    notifyListeners();
  }

  Future<void> changePassword(String current, String next) async {
    await api.changePassword(current, next);
    user = await api.me();
    notifyListeners();
  }

  Future<void> signOut() async {
    try {
      await api.logout();
    } catch (_) {
      // Signing out locally is what matters.
    }
    await _clearSession();
    notifyListeners();
  }

  Future<void> _clearSession() async {
    _token = null;
    user = null;
    await _secure.delete(key: _kToken).catchError((_) {});
  }

  Future<void> remember(VerifyResult result) async {
    localHistory.insert(0, ScanRecord.fromResult(result));
    if (localHistory.length > _maxHistory) {
      localHistory = localHistory.sublist(0, _maxHistory);
    }
    await _prefs.setString(
      _kHistory,
      jsonEncode(localHistory.map((e) => e.toJson()).toList()),
    );
    notifyListeners();
  }

  Future<void> clearLocalHistory() async {
    localHistory = [];
    await _prefs.remove(_kHistory);
    notifyListeners();
  }
}

/// Makes [AppState] available to the widget tree and rebuilds dependents when it changes.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child})
    : super(notifier: state);

  static AppState of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
  static AppState read(BuildContext context) =>
      context.getInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
