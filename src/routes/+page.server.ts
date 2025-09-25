import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

// This is a page server load function that runs on the server before the page is rendered
// Data returned from this function is available in the page component via the `data` prop
// and in other components via the $page.data store
//
// Key features of load functions:
// - Run on the server before page render
// - Can access cookies, headers, and other server-side data
// - Data is serialized and sent to the client
// - Perfect for fetching data from APIs, databases, etc.
// - Can throw errors or redirects

export const load: PageServerLoad = async ({ fetch, url, params, cookies }) => {
	try {
		// Fetch current weather for a default city (London)
		const response = await fetch('https://api.openweathermap.org/data/2.5/weather?q=London&appid=demo_key&units=metric');

		if (!response.ok) {
			// Use a free weather API that doesn't require API key
			const fallbackResponse = await fetch('https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current_weather=true&hourly=temperature_2m&forecast_days=1');

			if (fallbackResponse.ok) {
				const weatherData = await fallbackResponse.json();
				return {
					weather: {
						location: 'London',
						temperature: weatherData.current_weather.temperature,
						windspeed: weatherData.current_weather.windspeed,
						time: weatherData.current_weather.time
					},
					pageTitle: 'Weather Dashboard',
					loadedAt: new Date().toISOString()
				};
			}
		}

		// If OpenWeather works (unlikely without API key), use it
		const weatherData = await response.json();
		return {
			weather: {
				location: weatherData.name,
				temperature: weatherData.main.temp,
				description: weatherData.weather[0].description,
				humidity: weatherData.main.humidity
			},
			pageTitle: 'Weather Dashboard',
			loadedAt: new Date().toISOString()
		};

	} catch (error) {
		console.error('Error loading weather data:', error);

		return {
			weather: null,
			pageTitle: 'Weather Dashboard',
			loadedAt: new Date().toISOString(),
			error: 'Failed to load weather data'
		};
	}
};

// Actions allow you to handle form submissions and other POST requests
// They run on the server when triggered by forms or fetch requests
// Actions are perfect for:
// - Handling form submissions
// - Creating/updating/deleting data
// - Calling external APIs that require server-side processing
// - Any operation that should happen on the server

export const actions: Actions = {
	// Fetch weather for a specific city
	getWeather: async ({ request, fetch }) => {
		try {
			const formData = await request.formData();
			const city = formData.get('city') as string;

			if (!city) {
				return fail(400, {
					error: 'City name is required',
					city
				});
			}

			// Use Open-Meteo API (free, no API key required)
			// First, get coordinates for the city using a geocoding API
			const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);

			if (!geoResponse.ok) {
				return fail(500, {
					error: 'Failed to find city',
					city
				});
			}

			const geoData = await geoResponse.json();

			if (!geoData.results || geoData.results.length === 0) {
				return fail(404, {
					error: 'City not found',
					city
				});
			}

			const location = geoData.results[0];

			// Get weather data using coordinates
			const weatherResponse = await fetch(
				`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true&hourly=temperature_2m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min&forecast_days=3`
			);

			if (!weatherResponse.ok) {
				return fail(500, {
					error: 'Failed to fetch weather data',
					city
				});
			}

			const weatherData = await weatherResponse.json();

			return {
				success: true,
				weather: {
					location: `${location.name}, ${location.country}`,
					latitude: location.latitude,
					longitude: location.longitude,
					current: weatherData.current_weather,
					daily: weatherData.daily,
					timezone: weatherData.timezone
				},
				message: `Weather data fetched for ${location.name}!`
			};

		} catch (error) {
			console.error('Error fetching weather:', error);
			return fail(500, {
				error: 'An unexpected error occurred'
			});
		}
	},

	// Get current location weather (simplified example)
	getCurrentLocationWeather: async ({ fetch }) => {
		try {
			// Use default coordinates (London) as we can't access user's location on server
			const response = await fetch(
				'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current_weather=true&hourly=temperature_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1'
			);

			if (!response.ok) {
				return fail(500, { error: 'Failed to fetch current weather' });
			}

			const weatherData = await response.json();

			return {
				success: true,
				weather: {
					location: 'Default Location (London)',
					current: weatherData.current_weather,
					hourly: {
						temperature: weatherData.hourly.temperature_2m.slice(0, 24),
						wind_speed: weatherData.hourly.wind_speed_10m.slice(0, 24)
					},
					daily: weatherData.daily
				},
				message: 'Current weather fetched!'
			};
		} catch (error) {
			console.error('Error fetching current weather:', error);
			return fail(500, { error: 'Failed to fetch current weather' });
		}
	}
};