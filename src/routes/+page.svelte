<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';

	export let data: PageData;
	export let form: ActionData;

	let loading = false;
</script>

<div class="max-w-4xl mx-auto p-6 space-y-8">
	<header>
		<h1 class="text-3xl font-bold text-gray-900 mb-2">🌤️ Weather Dashboard</h1>
		<p class="text-gray-600">
			SvelteKit template demonstrating server-side data loading and actions with weather APIs
		</p>
	</header>

	<!-- Display global data from layout.server.ts -->
	<section class="bg-gray-50 rounded-lg p-4">
		<h2 class="text-xl font-semibold mb-2">Global Data (from layout.server.ts)</h2>
		<div class="space-y-1 text-sm">
			<p><strong>Theme:</strong> {data.theme}</p>
			<p><strong>Current Path:</strong> {data.currentPath}</p>
			<p><strong>Loaded At:</strong> {data.timestamp}</p>
		</div>
	</section>

	<!-- Display current weather from page load -->
	<section class="bg-blue-50 rounded-lg p-4">
		<h2 class="text-xl font-semibold mb-4">Current Weather (from page.server.ts load)</h2>
		{#if data.error}
			<p class="text-red-600">{data.error}</p>
		{:else if data.weather}
			<div class="bg-white p-4 rounded border">
				<h3 class="font-medium text-lg">{data.weather.location}</h3>
				<div class="mt-2 space-y-1 text-sm">
					<p><strong>Temperature:</strong> {data.weather.temperature}°C</p>
					{#if data.weather.description}
						<p><strong>Conditions:</strong> {data.weather.description}</p>
					{/if}
					{#if data.weather.windspeed}
						<p><strong>Wind Speed:</strong> {data.weather.windspeed} km/h</p>
					{/if}
					{#if data.weather.humidity}
						<p><strong>Humidity:</strong> {data.weather.humidity}%</p>
					{/if}
					{#if data.weather.time}
						<p><strong>Updated:</strong> {new Date(data.weather.time).toLocaleString()}</p>
					{/if}
				</div>
			</div>
		{/if}
	</section>

	<!-- Weather Actions -->
	<section class="space-y-6">
		<h2 class="text-xl font-semibold">Weather Actions</h2>

		<!-- Get weather for specific city -->
		<div class="bg-green-50 rounded-lg p-4">
			<h3 class="font-medium mb-3">Search Weather by City</h3>
			<form
				method="POST"
				action="?/getWeather"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update();
						loading = false;
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="city" class="block text-sm font-medium text-gray-700 mb-1">City Name</label>
					<input
						type="text"
						id="city"
						name="city"
						value={form?.city ?? ''}
						placeholder="e.g., New York, Tokyo, Paris"
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						required
					/>
				</div>
				<Button type="submit" variant="primary" {loading}>
					Get Weather
				</Button>
			</form>
		</div>

		<!-- Get current location weather -->
		<div class="bg-purple-50 rounded-lg p-4">
			<h3 class="font-medium mb-3">Default Location Weather</h3>
			<form
				method="POST"
				action="?/getCurrentLocationWeather"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update();
						loading = false;
					};
				}}
			>
				<Button type="submit" variant="secondary" {loading}>
					Get Default Weather
				</Button>
			</form>
		</div>

		<!-- Display weather results -->
		{#if form}
			<div class="mt-4">
				{#if form.success}
					<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
						<p class="font-semibold">{form.message}</p>
						{#if form.weather}
							<div class="mt-4 bg-white p-4 rounded border">
								<h4 class="font-medium text-lg text-gray-900">{form.weather.location}</h4>
								{#if form.weather.current}
									<div class="mt-2 grid grid-cols-2 gap-4 text-sm text-gray-700">
										<p><strong>Temperature:</strong> {form.weather.current.temperature}°C</p>
										<p><strong>Wind Speed:</strong> {form.weather.current.windspeed} km/h</p>
										<p><strong>Wind Direction:</strong> {form.weather.current.winddirection}°</p>
										<p><strong>Weather Code:</strong> {form.weather.current.weathercode}</p>
									</div>
									<p class="text-xs text-gray-500 mt-2">
										Updated: {new Date(form.weather.current.time).toLocaleString()}
									</p>
								{/if}
								{#if form.weather.daily}
									<div class="mt-4">
										<h5 class="font-medium text-gray-900">3-Day Forecast</h5>
										<div class="mt-2 space-y-2">
											{#each form.weather.daily.time as date, i}
												<div class="flex justify-between text-sm bg-gray-50 p-2 rounded">
													<span>{new Date(date).toLocaleDateString()}</span>
													<span>
														{form.weather.daily.temperature_2m_min[i]}°C - {form.weather.daily.temperature_2m_max[i]}°C
													</span>
												</div>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else if form.error}
					<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
						<p class="font-semibold">Error: {form.error}</p>
					</div>
				{/if}
			</div>
		{/if}
	</section>
</div>
