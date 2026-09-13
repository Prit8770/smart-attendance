const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');

// Middleware to restrict to admins
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins only' });
  }
};

// GET college location details
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const { data: loc } = await supabase.from('college_location')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!loc) {
      return res.status(404).json({ error: 'College location not configured.' });
    }
    res.json(loc);
  } catch (err) {
    console.error('Error fetching college location:', err);
    res.status(500).json({ error: 'Failed to retrieve college location.' });
  }
});

// POST/PUT set college location (Admin only)
router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  const { latitude, longitude, radius } = req.body;

  if (latitude === undefined || longitude === undefined || radius === undefined) {
    return res.status(400).json({ error: 'Latitude, longitude, and radius are required.' });
  }

  const parsedLat = parseFloat(latitude);
  const parsedLon = parseFloat(longitude);
  const parsedRad = parseFloat(radius);

  try {
    const { data: existingList } = await supabase.from('college_location').select('id');

    if (existingList && existingList.length > 0) {
      // Update all existing location rows to match new location
      const ids = existingList.map(e => e.id);
      await supabase.from('college_location').update({
        latitude: parsedLat,
        longitude: parsedLon,
        radius: parsedRad
      }).in('id', ids);
      
      res.json({ message: 'College location updated successfully.', location: { latitude: parsedLat, longitude: parsedLon, radius: parsedRad } });
    } else {
      const { data: result, error } = await supabase.from('college_location').insert([{
        latitude: parsedLat,
        longitude: parsedLon,
        radius: parsedRad
      }]).select().single();
      
      if (error) throw error;
      
      res.status(201).json({
        message: 'College location configured successfully.',
        location: { id: result.id, latitude: parsedLat, longitude: parsedLon, radius: parsedRad }
      });
    }
  } catch (err) {
    console.error('Error setting college location:', err);
    res.status(500).json({ error: 'Failed to configure college location.' });
  }
});

// GET /api/location/search?q=query
// Multi-engine search: Wikipedia (Colleges/Universities) + Nominatim India + Photon + Open-Meteo + Google Maps URL & Coordinates parsing
router.get('/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query || query.length < 2) {
    return res.json({ results: [] });
  }

  // 1. Check if user entered direct coordinates e.g. "23.0917, 72.5349" or "23.0917 72.5349"
  const coordMatch = query.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[3]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return res.json({
        results: [{
          id: `coord_${lat}_${lon}`,
          mainName: `Exact Coordinates (${lat.toFixed(6)}, ${lon.toFixed(6)})`,
          fullAddress: `Latitude: ${lat.toFixed(6)}, Longitude: ${lon.toFixed(6)}`,
          subtitle: `GPS Pinpoint`,
          lat,
          lon,
          type: 'Coordinates'
        }]
      });
    }
  }

  // 2. Check if user pasted a Google Maps URL e.g. https://www.google.com/maps/.../@23.0917,72.5349,17z...
  const gmapMatch = query.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || query.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (gmapMatch) {
    const lat = parseFloat(gmapMatch[1]);
    const lon = parseFloat(gmapMatch[2]);
    return res.json({
      results: [{
        id: `gmap_${lat}_${lon}`,
        mainName: 'Google Maps Pinned Location',
        fullAddress: `Selected from Google Maps link: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
        subtitle: `Latitude: ${lat.toFixed(6)}, Longitude: ${lon.toFixed(6)}`,
        lat,
        lon,
        type: 'Google Maps Link'
      }]
    });
  }

  const wikiResults = [];
  const osmIndiaResults = [];
  const photonResults = [];
  const openMeteoResults = [];
  const globalResults = [];

  const seen = new Set();
  const makeItem = (item) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (isNaN(lat) || isNaN(lon)) return null;
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      id: item.id || `loc_${lat}_${lon}`,
      mainName: item.mainName,
      fullAddress: item.fullAddress || item.mainName,
      subtitle: item.subtitle || item.fullAddress || '',
      lat,
      lon,
      type: item.type || 'Location'
    };
  };

  try {
    // Engine A: Wikipedia Knowledge Search (Finds virtually all Indian Universities, Colleges, Institutes & Landmarks)
    const wikiPromise = (async () => {
      try {
        const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`;
        const wRes = await fetch(wikiSearchUrl, { headers: { 'User-Agent': 'EduMark-College-Attendance/1.0 (contact@edumark.edu)' } });
        const wData = await wRes.json();
        const hits = (wData.query?.search || []).slice(0, 3);

        for (const h of hits) {
          const coordUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=coordinates|extracts&exintro=1&explaintext=1&exchars=150&titles=${encodeURIComponent(h.title)}&format=json`;
          const cRes = await fetch(coordUrl, { headers: { 'User-Agent': 'EduMark-College-Attendance/1.0 (contact@edumark.edu)' } });
          const cData = await cRes.json();
          const page = Object.values(cData.query?.pages || {})[0];
          const coords = page?.coordinates ? page.coordinates[0] : null;
          if (coords && coords.lat && coords.lon) {
            const extract = page.extract ? page.extract.replace(/\n/g, ' ').substring(0, 90) : '';
            wikiResults.push({
              id: `wiki_${h.title}`,
              mainName: h.title,
              fullAddress: extract ? `${h.title} — ${extract}...` : h.title,
              subtitle: 'Campus / University / Landmark',
              lat: coords.lat,
              lon: coords.lon,
              type: 'College / University'
            });
          }
        }
      } catch (e) {}
    })();

    // Engine B: Nominatim OpenStreetMap (India specific)
    const nominatimIndiaPromise = (async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=8&addressdetails=1`;
        const res = await fetch(url, { headers: { 'User-Agent': 'EduMark-College-Attendance/1.0 (contact@edumark.edu)' } });
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(item => {
            const nameParts = (item.display_name || '').split(',');
            const mainName = nameParts[0]?.trim() || item.name || query;
            const subtitle = nameParts.slice(1).join(',').trim();
            osmIndiaResults.push({
              id: `nom_in_${item.place_id}`,
              mainName,
              fullAddress: item.display_name,
              subtitle: subtitle || item.display_name,
              lat: item.lat,
              lon: item.lon,
              type: item.type || item.class || 'Location'
            });
          });
        }
      } catch (e) {}
    })();

    // Engine C: Photon Komoot Geocoder (Instant POI / area / street search)
    const photonPromise = (async () => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && Array.isArray(data.features)) {
          data.features.forEach(feat => {
            if (feat.geometry && Array.isArray(feat.geometry.coordinates)) {
              const lon = feat.geometry.coordinates[0];
              const lat = feat.geometry.coordinates[1];
              const props = feat.properties || {};
              const mainName = props.name || query;
              const addrParts = [
                props.street,
                props.district,
                props.city,
                props.state,
                props.country
              ].filter(Boolean).join(', ');
              photonResults.push({
                id: `pho_${props.osm_id || `${lat}_${lon}`}`,
                mainName,
                fullAddress: addrParts ? `${mainName}, ${addrParts}` : mainName,
                subtitle: addrParts || 'Place',
                lat,
                lon,
                type: props.osm_value || props.type || 'POI'
              });
            }
          });
        }
      } catch (e) {}
    })();

    // Engine D: Open-Meteo Geocoding (Great for Indian cities, towns, talukas)
    const openMeteoPromise = (async () => {
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && Array.isArray(data.results)) {
          data.results.forEach(item => {
            const mainName = item.name;
            const subtitle = [item.admin2, item.admin1, item.country].filter(Boolean).join(', ');
            openMeteoResults.push({
              id: `om_${item.id}`,
              mainName,
              fullAddress: `${mainName}, ${subtitle}`,
              subtitle,
              lat: item.latitude,
              lon: item.longitude,
              type: 'City / Area'
            });
          });
        }
      } catch (e) {}
    })();

    // Engine E: Global Nominatim fallback
    const nominatimGlobalPromise = (async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
        const res = await fetch(url, { headers: { 'User-Agent': 'EduMark-College-Attendance/1.0 (contact@edumark.edu)' } });
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(item => {
            const nameParts = (item.display_name || '').split(',');
            const mainName = nameParts[0]?.trim() || item.name || query;
            const subtitle = nameParts.slice(1).join(',').trim();
            globalResults.push({
              id: `nom_gl_${item.place_id}`,
              mainName,
              fullAddress: item.display_name,
              subtitle: subtitle || item.display_name,
              lat: item.lat,
              lon: item.lon,
              type: item.type || item.class || 'Location'
            });
          });
        }
      } catch (e) {}
    })();

    await Promise.all([wikiPromise, nominatimIndiaPromise, photonPromise, openMeteoPromise, nominatimGlobalPromise]);

    const finalResults = [];
    [...wikiResults, ...osmIndiaResults, ...photonResults, ...openMeteoResults, ...globalResults].forEach(item => {
      const formatted = makeItem(item);
      if (formatted) finalResults.push(formatted);
    });

    res.json({ results: finalResults.slice(0, 15) });
  } catch (err) {
    console.error('Location search error:', err);
    res.status(500).json({ error: 'Failed to perform location search', results: [] });
  }
});

module.exports = router;
