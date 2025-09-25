<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";

  let { children } = $props();
  import "../app.css";
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<nav class="bg-white shadow-sm border-b">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <div class="flex items-center">
        <a href="/" class="text-xl font-bold text-gray-900 hover:text-gray-700">
          Svelte Template
        </a>
      </div>
      <div class="flex space-x-8">
        <a
          href="/"
          class="text-gray-500 hover:text-gray-900 px-3 py-2 text-sm font-medium transition-colors"
        >
          Home
        </a>
        <a
          href="/example"
          class="text-gray-500 hover:text-gray-900 px-3 py-2 text-sm font-medium transition-colors"
        >
          Example
        </a>
      </div>
    </div>
  </div>
</nav>

<main>
  {@render children?.()}
</main>
