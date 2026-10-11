import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

class RouteInfo {
  final List<LatLng> points;
  final double distanceKm;
  final double durationMin;
  final bool
  approximate; // true when we couldn't get a road route and drew a straight line
  const RouteInfo(
    this.points,
    this.distanceKm,
    this.durationMin, {
    this.approximate = false,
  });
}

/// Driving routes from the public OSRM server (OpenStreetMap data). For production, point
/// [baseUrl] at your own OSRM instance or a commercial routing API.
class RoutingService {
  RoutingService({
    http.Client? client,
    this.baseUrl = 'https://router.project-osrm.org',
  }) : _http = client ?? http.Client();

  final http.Client _http;
  final String baseUrl;

  Future<RouteInfo> drive(LatLng from, LatLng to) async {
    try {
      final uri = Uri.parse(
        '$baseUrl/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}'
        '?overview=full&geometries=geojson',
      );
      final res = await _http
          .get(uri, headers: {'User-Agent': 'MediTrack/1.0'})
          .timeout(const Duration(seconds: 12));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final routes = body['routes'] as List?;
        if (routes != null && routes.isNotEmpty) {
          final r = routes.first as Map<String, dynamic>;
          final coords = (r['geometry']['coordinates'] as List)
              .map(
                (c) =>
                    LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()),
              )
              .toList();
          return RouteInfo(
            coords,
            (r['distance'] as num) / 1000,
            (r['duration'] as num) / 60,
          );
        }
      }
    } catch (_) {
      // Fall through to a straight line.
    }
    final km = const Distance().as(LengthUnit.Meter, from, to) / 1000;
    return RouteInfo(
      [from, to],
      km,
      km / 25 * 60,
      approximate: true,
    ); // ~25 km/h city driving
  }
}
