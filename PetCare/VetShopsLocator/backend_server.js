import express from 'express';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();
const app = express();
const PORT = process.env.PORT || 3002;

console.log('Starting server...');

// Foursquare API key from environment variables
const API_KEY = process.env.FOURSQUARE_API_KEY;

if (!API_KEY) {
    console.error('Error: FOURSQUARE_API_KEY not found in environment variables');
    process.exit(1);
}

// Enable CORS for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

// Middleware for serving static files (HTML, CSS, JS)
app.use(express.static('public'));

// Endpoint to geocode a city name
app.get('/api/geocode', async (req, res) => {
    try {
        const { city } = req.query;
        
        if (!city) {
            return res.status(400).json({ error: 'City name is required.' });
        }

        // Using the places/search endpoint with near parameter
        const url = `https://api.foursquare.com/v3/places/search?near=${encodeURIComponent(city)}&limit=1`;
        console.log('Geocoding URL:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': API_KEY,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Geocoding request failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('Geocoding response:', data);
        
        if (!data.results || data.results.length === 0 || !data.context || !data.context.geo_bounds) {
            return res.status(404).json({ error: 'Location not found.' });
        }

        // Use the center of the geo bounds for better accuracy
        const bounds = data.context.geo_bounds;
        const latitude = (bounds.circle.center.latitude);
        const longitude = (bounds.circle.center.longitude);

        res.json({
            latitude,
            longitude
        });
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            details: error.message
        });
    }
});

// Simple test endpoint to verify server is running
app.get('/api/test', (req, res) => {
    console.log('Test endpoint hit');
    res.json({ message: 'Server is working!' });
});

// Endpoint to fetch veterinary shops
app.get('/api/vetshops', async (req, res) => {
    try {
        const { latitude, longitude } = req.query;
        console.log('Request received with coordinates:', { latitude, longitude });

        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Latitude and Longitude are required.' });
        }

        // Make the actual request without test request
        const url = `https://api.foursquare.com/v3/places/search?ll=${latitude},${longitude}&query=veterinary,vet,animal hospital&radius=15000&limit=50&sort=DISTANCE`;
        console.log('Making request to:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': API_KEY,
                'Accept': 'application/json'
            }
        });

        console.log('Response status:', response.status);
        const responseText = await response.text();
        console.log('Response text:', responseText);

        if (!response.ok) {
            throw new Error(`Request failed: ${response.status} - ${responseText}`);
        }

        const data = JSON.parse(responseText);
        
        if (!data.results) {
            throw new Error('Invalid response format: no results field');
        }

        // Transform the response
        const transformedData = {
            features: data.results.map(place => ({
                properties: {
                    name: place.name || 'Unnamed Veterinary Shop',
                    address_line1: place.location?.formatted_address || place.location?.address || '',
                    address_line2: `${place.location?.locality || ''} ${place.location?.postcode || ''}`.trim(),
                    lat: place.geocodes?.main?.latitude || latitude,
                    lon: place.geocodes?.main?.longitude || longitude,
                    distance: place.distance || 0,
                    categories: place.categories?.map(cat => cat.name).join(', ') || ''
                }
            }))
        };

        if (transformedData.features.length === 0) {
            console.log('No results found, trying alternative search...');
            // Try an alternative search with just 'veterinary' category
            const altUrl = `https://api.foursquare.com/v3/places/search?ll=${latitude},${longitude}&categories=17000&radius=15000&limit=50&sort=DISTANCE`;
            const altResponse = await fetch(altUrl, {
                headers: {
                    'Authorization': API_KEY,
                    'Accept': 'application/json'
                }
            });

            if (altResponse.ok) {
                const altData = await altResponse.json();
                if (altData.results && altData.results.length > 0) {
                    transformedData.features = altData.results.map(place => ({
                        properties: {
                            name: place.name || 'Unnamed Veterinary Shop',
                            address_line1: place.location?.formatted_address || place.location?.address || '',
                            address_line2: `${place.location?.locality || ''} ${place.location?.postcode || ''}`.trim(),
                            lat: place.geocodes?.main?.latitude || latitude,
                            lon: place.geocodes?.main?.longitude || longitude,
                            distance: place.distance || 0,
                            categories: place.categories?.map(cat => cat.name).join(', ') || ''
                        }
                    }));
                }
            }
        }

        res.json(transformedData);
    } catch (error) {
        console.error('Detailed error:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        res.status(500).json({
            error: 'Internal Server Error',
            details: error.message,
            type: error.name
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        details: err.message
    });
});

// Start the server
const server = app.listen(PORT, (err) => {
    if (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Test the server by visiting: http://localhost:3002/api/test');
});

// Handle server shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
