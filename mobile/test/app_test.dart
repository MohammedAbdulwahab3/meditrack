import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:meditrack/api/api_client.dart';
import 'package:meditrack/api/code.dart';
import 'package:meditrack/api/models.dart';
import 'package:meditrack/screens/home_screen.dart';
import 'package:meditrack/screens/medicine_screen.dart';
import 'package:meditrack/state/app_state.dart';
import 'package:meditrack/widgets/medicine_art.dart';
import 'package:meditrack/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:meditrack/widgets/common.dart';

void main() {
  group('pack codes', () {
    test('normalizes what scanners and people produce', () {
      expect(normalizeCode('ABCD-EFGH-JKMN'), 'ABCDEFGHJKMN');
      expect(normalizeCode(' abcd efgh jkmn '), 'ABCDEFGHJKMN');
      expect(
        normalizeCode('https://meditrack.et/v/ABCD-EFGH-JKMN?x=1'),
        'ABCDEFGHJKMN',
      );
      expect(normalizeCode('O0Il'), '0011');
    });

    test('formats and validates', () {
      expect(formatCode('abcdefghjkmn'), 'ABCD-EFGH-JKMN');
      expect(isValidCode(normalizeCode('ABCD-EFGH-JKMN')), isTrue);
      expect(isValidCode('SHORT'), isFalse);
    });
  });

  group('API client', () {
    final verifyJson = {
      'status': 'genuine',
      'headline': 'Genuine medicine',
      'message': 'Registered.',
      'code': 'ABCD-EFGH-JKMN',
      'unit_state': 'dispensed',
      'product': {
        'name': 'Amoxil',
        'generic_name': 'Amoxicillin',
        'strength': '500 mg',
        'dosage_form': 'Capsule',
        'pack_size': '',
        'requires_prescription': true,
      },
      'manufacturer': {
        'name': 'Abyssinia Pharma',
        'type': 'manufacturer',
        'city': 'Addis Ababa',
        'country': 'Ethiopia',
      },
      'batch_number': 'AMX-1',
      'expires_on': '2028-01-01',
      'previous_checks': 2,
      'first_checked_at': '2026-10-01T10:00:00Z',
      'journey': [
        {
          'kind': 'manufactured',
          'at': '2026-09-01T10:00:00Z',
          'org': {
            'name': 'Abyssinia Pharma',
            'type': 'manufacturer',
            'city': 'Addis Ababa',
            'country': 'Ethiopia',
          },
        },
        {
          'kind': 'dispensed',
          'at': '2026-10-01T10:00:00Z',
          'org': {
            'name': 'Bole Pharmacy',
            'type': 'pharmacy',
            'city': 'Addis Ababa',
            'country': 'Ethiopia',
          },
        },
      ],
    };

    test('verify parses the result and sends the bearer token', () async {
      late http.Request seen;
      final client = ApiClient(
        baseUrl: 'http://server:8090/',
        token: 'tok',
        httpClient: MockClient((req) async {
          seen = req;
          return http.Response(jsonEncode(verifyJson), 200);
        }),
      );
      final r = await client.verify('ABCDEFGHJKMN');
      expect(seen.url.toString(), 'http://server:8090/api/verify/ABCDEFGHJKMN');
      expect(seen.headers['Authorization'], 'Bearer tok');
      expect(r.status, 'genuine');
      expect(r.product!.requiresPrescription, isTrue);
      expect(r.journey.map((s) => s.kind), ['manufactured', 'dispensed']);
      expect(r.previousChecks, 2);
      expect(ScanRecord.fromResult(r).productName, 'Amoxil 500 mg');
    });

    test('surfaces API field errors', () async {
      final client = ApiClient(
        baseUrl: 'http://server',
        httpClient: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'error': {
                'code': 'invalid',
                'message': 'Please fix the highlighted fields.',
                'fields': {'email': 'Enter a valid email address.'},
              },
            }),
            422,
          ),
        ),
      );
      expect(
        () => client.registerPatient(
          fullName: 'A',
          email: 'bad',
          phone: '',
          password: 'password123',
        ),
        throwsA(
          isA<ApiException>().having(
            (e) => e.fields['email'],
            'email error',
            'Enter a valid email address.',
          ),
        ),
      );
    });

    test('explains when the server is down', () async {
      final client = ApiClient(
        baseUrl: 'http://server',
        httpClient: MockClient((_) async => http.Response('Bad gateway', 502)),
      );
      expect(
        () => client.verify('ABCDEFGHJKMN'),
        throwsA(
          isA<ApiException>().having((e) => e.code, 'code', 'unavailable'),
        ),
      );
    });

    test('login returns token and profile', () async {
      final client = ApiClient(
        baseUrl: 'http://server',
        httpClient: MockClient((req) async {
          expect(req.headers['X-Client'], 'mobile');
          return http.Response(
            jsonEncode({
              'token': 'abc',
              'me': {
                'user': {
                  'id': '1',
                  'email': 'p@x.com',
                  'full_name': 'Sara',
                  'phone': '',
                  'role': 'patient',
                },
              },
            }),
            200,
          );
        }),
      );
      final (token, user) = await client.login('p@x.com', 'password123');
      expect(token, 'abc');
      expect(user.role, 'patient');
    });
  });

  testWidgets(
    'home screen rejects a malformed code without calling the server',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final state = AppState(
        await SharedPreferences.getInstance(),
        const FlutterSecureStorage(),
      );
      await tester.pumpWidget(
        AppScope(
          state: state,
          child: MaterialApp(theme: buildTheme(), home: const HomeScreen()),
        ),
      );
      expect(find.text('Scan a medicine'), findsOneWidget);
      await tester.tap(find.text('Type a code instead'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'ABC');
      await tester.tap(find.text('Check this pack'));
      await tester.pump();
      expect(
        find.text('Codes have 12 characters, like ABCD-EFGH-JKMN.'),
        findsOneWidget,
      );
    },
  );

  group('marketplace', () {
    test('formats money', () {
      expect(formatMoney(1234.5), 'ETB 1,234.50');
      expect(formatMoney(35), 'ETB 35.00');
    });

    test('parses offers and orders', () {
      final offer = Offer.fromJson({
        'seller': {
          'id': 's1',
          'name': 'Bole Pharmacy',
          'type': 'pharmacy',
          'city': 'Addis Ababa',
          'address': '',
          'phone': '',
        },
        'product': {
          'id': 'p1',
          'name': 'Panadol',
          'generic_name': 'Paracetamol',
          'strength': '500 mg',
          'dosage_form': 'Tablet',
          'pack_size': '',
          'manufacturer_name': 'X',
          'requires_prescription': false,
        },
        'unit_price': 35,
        'currency': 'ETB',
        'available': 4,
      });
      expect(offer.unitPrice, 35.0);
      expect(offer.available, 4);

      final order = Order.fromJson({
        'id': 'o1',
        'reference': 'ORD-2026-000001',
        'status': 'completed',
        'seller': {
          'id': 's1',
          'name': 'Bole Pharmacy',
          'type': 'pharmacy',
          'city': 'Addis Ababa',
          'address': 'Bole Rd',
          'phone': '',
        },
        'items': [
          {
            'product_id': 'p1',
            'name': 'Panadol',
            'strength': '500 mg',
            'dosage_form': 'Tablet',
            'requires_prescription': false,
            'quantity': 2,
            'unit_price': 35,
            'line_total': 70,
          },
        ],
        'packs': [
          {
            'code': 'ABCD-EFGH-JKMN',
            'product_name': 'Panadol 500 mg',
            'batch_number': 'B1',
            'expires_on': '2028-01-01',
          },
        ],
        'total': 70,
        'currency': 'ETB',
        'note': '',
        'decline_reason': '',
        'requires_prescription': false,
        'created_at': '2026-10-11T10:00:00Z',
      });
      expect(order.pharmacy.name, 'Bole Pharmacy');
      expect(order.items.single.lineTotal, 70);
      expect(order.packs.single.code, 'ABCD-EFGH-JKMN');
      expect(orderStatusLook(order.status).$2, 'Collected');
    });
  });

  group('find medicine', () {
    Offer offer(String product, String seller, double price, double? km) =>
        Offer.fromJson({
          'seller': {'id': seller, 'name': seller},
          'product': {'id': product, 'name': product, 'dosage_form': 'Tablet'},
          'unit_price': price,
          'available': 10,
          'distance_km': km,
        });

    test('groups offers per medicine, nearest pharmacy and medicine first', () {
      final groups = groupOffers([
        offer('far-med', 'a', 10, 9),
        offer('near-med', 'b', 30, 4),
        offer('near-med', 'c', 20, 1.5),
        offer('near-med', 'd', 15, null),
      ]);
      expect(groups.map((g) => g.product.id), ['near-med', 'far-med']);
      expect(groups.first.offers.map((o) => o.seller.id), ['c', 'b', 'd']);
      expect(groups.first.nearestKm, 1.5);
      expect(groups.first.minPrice, 15);
      expect(shortMoney(30, 'ETB'), 'ETB 30');
    });

    test('picks an illustration from the dosage form', () {
      expect(medicineFormOf('Film-coated tablet'), MedicineForm.tablet);
      expect(medicineFormOf('Eye drops'), MedicineForm.drops);
      expect(medicineFormOf('Oral suspension'), MedicineForm.syrup);
      expect(medicineFormOf('Ointment'), MedicineForm.cream);
      expect(medicineFormOf('Ampoule'), MedicineForm.injection);
      expect(medicineFormOf('Something new'), MedicineForm.other);
      expect(medicinePalette('Panadol'), same(medicinePalette('Panadol')));
    });
  });

  test('profile carries the forced password change flag', () {
    final base = {'id': 'u1', 'email': 'a@b.c', 'role': 'patient'};
    expect(UserProfile.fromJson(base).mustChangePassword, isFalse);
    expect(
      UserProfile.fromJson({
        ...base,
        'must_change_password': true,
      }).mustChangePassword,
      isTrue,
    );
  });
}
