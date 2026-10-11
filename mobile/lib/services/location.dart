import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

enum LocationStatus {
  unknown,
  locating,
  ready,
  serviceOff,
  denied,
  deniedForever,
  failed,
}

/// The phone's position, shared app-wide. Screens listen to it and ask for a fix when needed.
class LocationService extends ChangeNotifier {
  LocationService._();
  static final instance = LocationService._();

  LatLng? position;
  LocationStatus status = LocationStatus.unknown;

  bool get hasFix => position != null;

  /// Gets a position, asking for permission if needed. Returns null when unavailable;
  /// [status] then explains why.
  Future<LatLng?> locate({bool force = false}) async {
    if (status == LocationStatus.locating) return position;
    if (position != null && !force) return position;
    _set(LocationStatus.locating);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _set(LocationStatus.serviceOff);
        return null;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied) {
        _set(LocationStatus.denied);
        return null;
      }
      if (permission == LocationPermission.deniedForever) {
        _set(LocationStatus.deniedForever);
        return null;
      }
      // A recent cached fix makes the list appear instantly; refine with a fresh one.
      final last = await Geolocator.getLastKnownPosition();
      if (last != null && position == null) {
        position = LatLng(last.latitude, last.longitude);
        notifyListeners();
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      position = LatLng(p.latitude, p.longitude);
      _set(LocationStatus.ready);
      return position;
    } catch (_) {
      _set(position != null ? LocationStatus.ready : LocationStatus.failed);
      return position;
    }
  }

  Future<void> openSettings() async {
    if (status == LocationStatus.serviceOff) {
      await Geolocator.openLocationSettings();
    } else {
      await Geolocator.openAppSettings();
    }
  }

  void _set(LocationStatus s) {
    status = s;
    notifyListeners();
  }

  String get problem => switch (status) {
    LocationStatus.serviceOff => 'Location is turned off on this phone.',
    LocationStatus.denied =>
      'MediTrack needs location permission to find pharmacies near you.',
    LocationStatus.deniedForever =>
      'Location permission is blocked. Allow it in Settings to see nearby pharmacies.',
    LocationStatus.failed =>
      "Couldn't get your location. Try again outside or near a window.",
    _ => '',
  };
}
