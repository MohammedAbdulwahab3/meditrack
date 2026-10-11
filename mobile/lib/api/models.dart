// Data types returned by the MediTrack API (see backend/internal/app).

DateTime? _date(dynamic v) =>
    v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;

class VerifyOrg {
  final String name, type, city, country;
  const VerifyOrg({
    required this.name,
    required this.type,
    required this.city,
    required this.country,
  });

  factory VerifyOrg.fromJson(Map<String, dynamic> j) => VerifyOrg(
    name: j['name'] ?? '',
    type: j['type'] ?? '',
    city: j['city'] ?? '',
    country: j['country'] ?? '',
  );
}

class JourneyStep {
  final String kind; // manufactured | shipped | received | returned | dispensed
  final DateTime? at;
  final VerifyOrg org;
  final VerifyOrg? to;
  const JourneyStep({
    required this.kind,
    required this.at,
    required this.org,
    this.to,
  });

  factory JourneyStep.fromJson(Map<String, dynamic> j) => JourneyStep(
    kind: j['kind'] ?? '',
    at: _date(j['at']),
    org: VerifyOrg.fromJson(j['org'] ?? {}),
    to: j['to'] == null ? null : VerifyOrg.fromJson(j['to']),
  );
}

class VerifyProduct {
  final String name, genericName, strength, dosageForm, packSize;
  final bool requiresPrescription;
  const VerifyProduct({
    required this.name,
    required this.genericName,
    required this.strength,
    required this.dosageForm,
    required this.packSize,
    required this.requiresPrescription,
  });

  factory VerifyProduct.fromJson(Map<String, dynamic> j) => VerifyProduct(
    name: j['name'] ?? '',
    genericName: j['generic_name'] ?? '',
    strength: j['strength'] ?? '',
    dosageForm: j['dosage_form'] ?? '',
    packSize: j['pack_size'] ?? '',
    requiresPrescription: j['requires_prescription'] == true,
  );
}

/// Verification outcome. `status` is one of:
/// genuine, warning, expired, recalled, suspended, not_found.
class VerifyResult {
  final String status, headline, message, code;
  final String? unitState, batchNumber, manufacturedOn, expiresOn, recallReason;
  final VerifyProduct? product;
  final VerifyOrg? manufacturer, currentHolder, dispensedBy;
  final DateTime? dispensedAt, firstCheckedAt;
  final int previousChecks;
  final List<JourneyStep> journey;

  const VerifyResult({
    required this.status,
    required this.headline,
    required this.message,
    required this.code,
    this.unitState,
    this.batchNumber,
    this.manufacturedOn,
    this.expiresOn,
    this.recallReason,
    this.product,
    this.manufacturer,
    this.currentHolder,
    this.dispensedBy,
    this.dispensedAt,
    this.firstCheckedAt,
    this.previousChecks = 0,
    this.journey = const [],
  });

  factory VerifyResult.fromJson(Map<String, dynamic> j) => VerifyResult(
    status: j['status'] ?? 'not_found',
    headline: j['headline'] ?? '',
    message: j['message'] ?? '',
    code: j['code'] ?? '',
    unitState: j['unit_state'],
    batchNumber: j['batch_number'],
    manufacturedOn: j['manufactured_on'],
    expiresOn: j['expires_on'],
    recallReason: (j['recall_reason'] as String?)?.isEmpty == true
        ? null
        : j['recall_reason'],
    product: j['product'] == null ? null : VerifyProduct.fromJson(j['product']),
    manufacturer: j['manufacturer'] == null
        ? null
        : VerifyOrg.fromJson(j['manufacturer']),
    currentHolder: j['current_holder'] == null
        ? null
        : VerifyOrg.fromJson(j['current_holder']),
    dispensedBy: j['dispensed_by'] == null
        ? null
        : VerifyOrg.fromJson(j['dispensed_by']),
    dispensedAt: _date(j['dispensed_at']),
    firstCheckedAt: _date(j['first_checked_at']),
    previousChecks: (j['previous_checks'] as num?)?.toInt() ?? 0,
    journey: ((j['journey'] as List?) ?? [])
        .map((e) => JourneyStep.fromJson(e))
        .toList(),
  );
}

/// One check, shown in the History tab (from the device or from the account).
class ScanRecord {
  final String code, result, productName, batchNumber;
  final DateTime checkedAt;
  const ScanRecord({
    required this.code,
    required this.result,
    required this.productName,
    required this.batchNumber,
    required this.checkedAt,
  });

  factory ScanRecord.fromJson(Map<String, dynamic> j) => ScanRecord(
    code: j['code'] ?? '',
    result: j['result'] ?? '',
    productName: j['product_name'] ?? '',
    batchNumber: j['batch_number'] ?? '',
    checkedAt: _date(j['checked_at']) ?? DateTime.now(),
  );

  Map<String, dynamic> toJson() => {
    'code': code,
    'result': result,
    'product_name': productName,
    'batch_number': batchNumber,
    'checked_at': checkedAt.toUtc().toIso8601String(),
  };

  factory ScanRecord.fromResult(VerifyResult r) => ScanRecord(
    code: r.code,
    result: r.status,
    productName: r.product == null
        ? ''
        : '${r.product!.name} ${r.product!.strength}',
    batchNumber: r.batchNumber ?? '',
    checkedAt: DateTime.now(),
  );
}

class Report {
  final String id, code, productName, place, description, status, adminNote;
  final DateTime? createdAt;
  const Report({
    required this.id,
    required this.code,
    required this.productName,
    required this.place,
    required this.description,
    required this.status,
    required this.adminNote,
    this.createdAt,
  });

  factory Report.fromJson(Map<String, dynamic> j) => Report(
    id: j['id'] ?? '',
    code: j['code'] ?? '',
    productName: j['product_name'] ?? '',
    place: j['place'] ?? '',
    description: j['description'] ?? '',
    status: j['status'] ?? 'open',
    adminNote: j['admin_note'] ?? '',
    createdAt: _date(j['created_at']),
  );
}

class UserProfile {
  final String id, email, fullName, phone, role;
  const UserProfile({
    required this.id,
    required this.email,
    required this.fullName,
    required this.phone,
    required this.role,
  });

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
    id: j['id'] ?? '',
    email: j['email'] ?? '',
    fullName: j['full_name'] ?? '',
    phone: j['phone'] ?? '',
    role: j['role'] ?? '',
  );
}

// ---- Marketplace ----

class OfferSeller {
  final String id, name, type, city, address, phone;
  final double? latitude, longitude;
  const OfferSeller({
    required this.id,
    required this.name,
    required this.type,
    required this.city,
    required this.address,
    required this.phone,
    this.latitude,
    this.longitude,
  });

  bool get hasLocation => latitude != null && longitude != null;

  factory OfferSeller.fromJson(Map<String, dynamic> j) => OfferSeller(
    id: j['id'] ?? '',
    name: j['name'] ?? '',
    type: j['type'] ?? '',
    city: j['city'] ?? '',
    address: j['address'] ?? '',
    phone: j['phone'] ?? '',
    latitude: (j['latitude'] as num?)?.toDouble(),
    longitude: (j['longitude'] as num?)?.toDouble(),
  );
}

class OfferProduct {
  final String id,
      name,
      genericName,
      strength,
      dosageForm,
      packSize,
      manufacturerName;
  final bool requiresPrescription;
  const OfferProduct({
    required this.id,
    required this.name,
    required this.genericName,
    required this.strength,
    required this.dosageForm,
    required this.packSize,
    required this.manufacturerName,
    required this.requiresPrescription,
  });

  factory OfferProduct.fromJson(Map<String, dynamic> j) => OfferProduct(
    id: j['id'] ?? '',
    name: j['name'] ?? '',
    genericName: j['generic_name'] ?? '',
    strength: j['strength'] ?? '',
    dosageForm: j['dosage_form'] ?? '',
    packSize: j['pack_size'] ?? '',
    manufacturerName: j['manufacturer_name'] ?? '',
    requiresPrescription: j['requires_prescription'] == true,
  );
}

/// A pharmacy's price and genuine, sellable stock for one medicine.
class Offer {
  final OfferSeller seller;
  final OfferProduct product;
  final double unitPrice;
  final String currency;
  final int available;
  final double? distanceKm;
  const Offer({
    required this.seller,
    required this.product,
    required this.unitPrice,
    required this.currency,
    required this.available,
    this.distanceKm,
  });

  factory Offer.fromJson(Map<String, dynamic> j) => Offer(
    seller: OfferSeller.fromJson(j['seller'] ?? {}),
    product: OfferProduct.fromJson(j['product'] ?? {}),
    unitPrice: (j['unit_price'] as num?)?.toDouble() ?? 0,
    currency: j['currency'] ?? 'ETB',
    available: (j['available'] as num?)?.toInt() ?? 0,
    distanceKm: (j['distance_km'] as num?)?.toDouble(),
  );
}

class OrderItem {
  final String productId, name, strength, dosageForm;
  final bool requiresPrescription;
  final int quantity;
  final double unitPrice, lineTotal;
  const OrderItem({
    required this.productId,
    required this.name,
    required this.strength,
    required this.dosageForm,
    required this.requiresPrescription,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
  });

  factory OrderItem.fromJson(Map<String, dynamic> j) => OrderItem(
    productId: j['product_id'] ?? '',
    name: j['name'] ?? '',
    strength: j['strength'] ?? '',
    dosageForm: j['dosage_form'] ?? '',
    requiresPrescription: j['requires_prescription'] == true,
    quantity: (j['quantity'] as num?)?.toInt() ?? 0,
    unitPrice: (j['unit_price'] as num?)?.toDouble() ?? 0,
    lineTotal: (j['line_total'] as num?)?.toDouble() ?? 0,
  );
}

class OrderPack {
  final String code, productName, batchNumber, expiresOn;
  const OrderPack({
    required this.code,
    required this.productName,
    required this.batchNumber,
    required this.expiresOn,
  });

  factory OrderPack.fromJson(Map<String, dynamic> j) => OrderPack(
    code: j['code'] ?? '',
    productName: j['product_name'] ?? '',
    batchNumber: j['batch_number'] ?? '',
    expiresOn: j['expires_on'] ?? '',
  );
}

/// A patient's pickup reservation. Status: pending → confirmed (ready) → completed, or rejected / cancelled.
class Order {
  final String id, reference, status, note, declineReason, currency;
  final OfferSeller pharmacy;
  final List<OrderItem> items;
  final List<OrderPack> packs;
  final double total;
  final bool requiresPrescription;
  final DateTime? createdAt;
  const Order({
    required this.id,
    required this.reference,
    required this.status,
    required this.note,
    required this.declineReason,
    required this.currency,
    required this.pharmacy,
    required this.items,
    required this.packs,
    required this.total,
    required this.requiresPrescription,
    this.createdAt,
  });

  factory Order.fromJson(Map<String, dynamic> j) => Order(
    id: j['id'] ?? '',
    reference: j['reference'] ?? '',
    status: j['status'] ?? '',
    note: j['note'] ?? '',
    declineReason: j['decline_reason'] ?? '',
    currency: j['currency'] ?? 'ETB',
    pharmacy: OfferSeller.fromJson(j['seller'] ?? {}),
    items: ((j['items'] as List?) ?? [])
        .map((e) => OrderItem.fromJson(e))
        .toList(),
    packs: ((j['packs'] as List?) ?? [])
        .map((e) => OrderPack.fromJson(e))
        .toList(),
    total: (j['total'] as num?)?.toDouble() ?? 0,
    requiresPrescription: j['requires_prescription'] == true,
    createdAt: _date(j['created_at']),
  );
}

/// An approved pharmacy, with distance from the user when known.
class Pharmacy {
  final String id, name, city, address, phone;
  final double? latitude, longitude, distanceKm;
  final int productsInStock;
  const Pharmacy({
    required this.id,
    required this.name,
    required this.city,
    required this.address,
    required this.phone,
    this.latitude,
    this.longitude,
    this.distanceKm,
    this.productsInStock = 0,
  });

  bool get hasLocation => latitude != null && longitude != null;

  factory Pharmacy.fromJson(Map<String, dynamic> j) => Pharmacy(
    id: j['id'] ?? '',
    name: j['name'] ?? '',
    city: j['city'] ?? '',
    address: j['address'] ?? '',
    phone: j['phone'] ?? '',
    latitude: (j['latitude'] as num?)?.toDouble(),
    longitude: (j['longitude'] as num?)?.toDouble(),
    distanceKm: (j['distance_km'] as num?)?.toDouble(),
    productsInStock: (j['products_in_stock'] as num?)?.toInt() ?? 0,
  );

  factory Pharmacy.fromSeller(OfferSeller s, {double? distanceKm}) => Pharmacy(
    id: s.id,
    name: s.name,
    city: s.city,
    address: s.address,
    phone: s.phone,
    latitude: s.latitude,
    longitude: s.longitude,
    distanceKm: distanceKm,
  );
}
