# Pickup and dropoff map rendering

Use `MapLocationMarker` with the bundled pickup, dropoff and driver PNG images
on both native platforms. Do not replace Android stop markers with a default
`pinColor` marker: that path produced invisible pickup/dropoff markers on the
connected Android development build, while the image-based driver marker still
rendered. Bundled stop images were verified visibly on the same phone and trip.
The stop image has a bottom anchor; the driver's image is centered on its GPS.

Delivery tracking starts a watcher without awaiting the first high-accuracy
one-shot fix. A pending or failed one-shot fix must not prevent live updates.
Conversely, watcher startup failure must not prevent the one-shot result from
showing the driver. A newer live update invalidates an older pending snapshot.

The pickup screen remembers its real GPS fix by trip ID. The dropoff screen can
use it immediately while obtaining live GPS. The memory cache expires after one
minute, never crosses trip IDs, rejects invalid coordinates, and is not persisted.
It does not invent a driver location from the pickup or dropoff destination.
Empty route coordinate strings are invalid, rather than coordinates at zero.

The delivery transition callback does not depend on changing request status;
otherwise its initialization effect tears down and recreates GPS tracking during
the transition. Socket and location subscriptions are removed on unmount,
including when setup fails or permissions are denied. The map is keyed by trip
and refits its route after native map load and layout events.

Regression coverage includes native image props, pickup handoff, delayed initial
GPS, watcher startup failure, stale GPS responses, live updates without route
remounting, route/map readiness order, camera navigation mode and invalid route
coordinates. Native marker visibility also requires device inspection; a mocked
MapView test cannot prove that Android has drawn an icon.
