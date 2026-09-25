const clean = (value) => String(value || '').trim();

/**
 * Decide which map provider can deliver the best startup experience.
 * @param {{googleApiKey?: string, cesiumToken?: string}} credentials
 * @returns {'google-direct'|'google-ion'|'osm'}
 */
export function selectMapStartupRoute({ googleApiKey = '', cesiumToken = '' } = {}) {
  if (clean(googleApiKey)) return 'google-direct';
  if (clean(cesiumToken)) return 'google-ion';
  return 'osm';
}

/**
 * Load Google Photorealistic 3D Tiles through direct Google access when
 * configured, otherwise through Cesium ion's hosted Google asset. If the
 * direct request fails and an ion token is available, ion is the recovery path.
 *
 * @param {object} Cesium
 * @param {{googleApiKey?: string, cesiumToken?: string}} credentials
 * @returns {Promise<{tileset: object|null, route: 'google-direct'|'google-ion'|'osm', errors: Error[]}>}
 */
export async function loadPhotorealisticTileset(
  Cesium,
  { googleApiKey = '', cesiumToken = '' } = {},
) {
  const googleKey = clean(googleApiKey);
  const ionToken = clean(cesiumToken);
  const errors = [];

  if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;

  const attempts = [];
  if (googleKey) attempts.push({ route: 'google-direct', googleKey });
  if (ionToken) attempts.push({ route: 'google-ion', googleKey: undefined });

  for (const attempt of attempts) {
    Cesium.GoogleMaps.defaultApiKey = attempt.googleKey;
    try {
      const tileset = await Cesium.createGooglePhotorealistic3DTileset({
        onlyUsingWithGoogleGeocoder: true,
      }, {
        // Screen-space error is the pixel budget a tile may be "wrong" by
        // before a finer one is fetched; Cesium defaults to 16. Halving it
        // pulls in roughly 4x the tiles, which is what buys visibly sharper
        // geometry and texture at street level. It also spends provider quota
        // and memory at that rate — raise this back toward 16 first if the
        // ion allowance or the frame rate becomes the binding constraint.
        // A 2x2 comparison over Tokyo Tower at ~470 m ranked the four
        // combinations: default/default worst, this alone barely better,
        // native resolution alone a clear jump, and both together best. The
        // LOD refinement only pays off once the render stops being upscaled —
        // a 16 px silhouette error hides inside interpolation blur. So if
        // quota or frame rate forces a rollback, raise this back toward 16
        // and keep the native resolution: that combination kept most of the
        // gain here.
        maximumScreenSpaceError: 8,
      });
      return { tileset, route: attempt.route, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  Cesium.GoogleMaps.defaultApiKey = undefined;
  return { tileset: null, route: 'osm', errors };
}
