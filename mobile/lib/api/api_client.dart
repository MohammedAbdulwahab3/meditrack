import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'models.dart';

class ApiException implements Exception {
  final int status;
  final String code;
  final String message;
  final Map<String, String> fields;
  const ApiException(
    this.status,
    this.code,
    this.message, [
    this.fields = const {},
  ]);

  /// The first field error, or the general message.
  String get display =>
      fields.values.isNotEmpty ? fields.values.first : message;

  @override
  String toString() => message;
}

/// Talks to the MediTrack Go API. Mobile clients authenticate with a bearer token
/// (requested with the `X-Client: mobile` header at sign-in).
class ApiClient {
  ApiClient({required this.baseUrl, this.token, http.Client? httpClient})
    : _http = httpClient ?? http.Client();

  final String baseUrl;
  final String? token;
  final http.Client _http;

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return Uri.parse('$base/api$path').replace(queryParameters: query);
  }

  Map<String, String> get _headers => {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Client': 'mobile',
    if (token != null) 'Authorization': 'Bearer $token',
  };

  Future<dynamic> _send(Future<http.Response> Function() call) async {
    final http.Response res;
    try {
      res = await call().timeout(const Duration(seconds: 20));
    } on SocketException {
      throw const ApiException(
        0,
        'offline',
        "Can't reach MediTrack. Check your internet connection.",
      );
    } on TimeoutException {
      throw const ApiException(
        0,
        'timeout',
        'MediTrack is taking too long to respond. Try again.',
      );
    } on http.ClientException {
      throw const ApiException(
        0,
        'offline',
        "Can't reach MediTrack. Check your internet connection.",
      );
    }
    if (res.statusCode == 204) return null;
    dynamic body;
    try {
      body = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      body = null;
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return body;
    final err = body is Map ? body['error'] : null;
    if (err is Map) {
      final fields = <String, String>{};
      (err['fields'] as Map?)?.forEach((k, v) => fields['$k'] = '$v');
      throw ApiException(
        res.statusCode,
        '${err['code'] ?? 'error'}',
        '${err['message'] ?? 'Request failed.'}',
        fields,
      );
    }
    throw ApiException(
      res.statusCode,
      'unavailable',
      "MediTrack isn't responding right now. Please try again shortly.",
    );
  }

  Future<dynamic> _get(String path, [Map<String, String>? query]) =>
      _send(() => _http.get(_uri(path, query), headers: _headers));
  Future<dynamic> _post(String path, Object body) => _send(
    () => _http.post(_uri(path), headers: _headers, body: jsonEncode(body)),
  );
  Future<dynamic> _put(String path, Object body) => _send(
    () => _http.put(_uri(path), headers: _headers, body: jsonEncode(body)),
  );

  // ---- Public ----

  Future<VerifyResult> verify(String code) async => VerifyResult.fromJson(
    await _get('/verify/${Uri.encodeComponent(code)}') as Map<String, dynamic>,
  );

  Future<void> report({
    required String code,
    required String productName,
    required String place,
    required String contact,
    required String description,
  }) => _post('/reports', {
    'code': code,
    'product_name': productName,
    'place': place,
    'contact': contact,
    'description': description,
  });

  // ---- Account ----

  Future<(String token, UserProfile user)> login(
    String email,
    String password,
  ) async {
    final body =
        await _post('/auth/login', {'email': email, 'password': password})
            as Map<String, dynamic>;
    return (body['token'] as String, UserProfile.fromJson(body['me']['user']));
  }

  Future<(String token, UserProfile user)> registerPatient({
    required String fullName,
    required String email,
    required String phone,
    required String password,
  }) async {
    final body =
        await _post('/auth/register/patient', {
              'full_name': fullName,
              'email': email,
              'phone': phone,
              'password': password,
            })
            as Map<String, dynamic>;
    return (body['token'] as String, UserProfile.fromJson(body['me']['user']));
  }

  Future<UserProfile> me() async {
    final body = await _get('/auth/me') as Map<String, dynamic>;
    return UserProfile.fromJson(body['user']);
  }

  Future<void> logout() => _post('/auth/logout', {});

  /// Changes the password; other devices are signed out.
  Future<void> changePassword(String current, String next) => _put(
    '/auth/password',
    {'current_password': current, 'new_password': next},
  );

  Future<List<ScanRecord>> myScans() async {
    final body =
        await _get('/me/scans', {'limit': '100'}) as Map<String, dynamic>;
    return ((body['items'] as List?) ?? [])
        .map((e) => ScanRecord.fromJson(e))
        .toList();
  }

  Future<List<Report>> myReports() async {
    final body = await _get('/me/reports');
    return ((body as List?) ?? []).map((e) => Report.fromJson(e)).toList();
  }

  // ---- Marketplace ----

  Future<List<Offer>> offers({
    String q = '',
    String city = '',
    String? sellerId,
    double? lat,
    double? lng,
  }) async {
    final body = await _get('/market/offers', {
      'side': 'retail',
      if (q.isNotEmpty) 'q': q,
      if (city.isNotEmpty) 'city': city,
      if (sellerId != null) 'seller_id': sellerId,
      if (lat != null && lng != null) ...{'lat': '$lat', 'lng': '$lng'},
    });
    return ((body as List?) ?? []).map((e) => Offer.fromJson(e)).toList();
  }

  Future<List<Pharmacy>> pharmacies({
    String q = '',
    double? lat,
    double? lng,
  }) async {
    final body = await _get('/market/pharmacies', {
      if (q.isNotEmpty) 'q': q,
      if (lat != null && lng != null) ...{'lat': '$lat', 'lng': '$lng'},
    });
    return ((body as List?) ?? []).map((e) => Pharmacy.fromJson(e)).toList();
  }

  Future<Order> reserve({
    required String pharmacyId,
    required String productId,
    required int quantity,
    String note = '',
  }) async => Order.fromJson(
    await _post('/orders', {
          'seller_id': pharmacyId,
          'items': [
            {'product_id': productId, 'quantity': quantity},
          ],
          'note': note,
        })
        as Map<String, dynamic>,
  );

  Future<List<Order>> myOrders() async {
    final body =
        await _get('/orders', {'side': 'buying', 'limit': '100'})
            as Map<String, dynamic>;
    return ((body['items'] as List?) ?? [])
        .map((e) => Order.fromJson(e))
        .toList();
  }

  Future<Order> order(String id) async =>
      Order.fromJson(await _get('/orders/$id') as Map<String, dynamic>);

  Future<Order> cancelOrder(String id) async => Order.fromJson(
    await _post('/orders/$id/cancel', {}) as Map<String, dynamic>,
  );
}
