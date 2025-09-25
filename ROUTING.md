# SvelteKit File-Based Routing Guide

## Overview
SvelteKit uses file-based routing where the file structure in `src/routes/` directly maps to your application's URL structure.

## File Structure & URL Mapping

```
src/routes/
├── +page.svelte              → / (home page)
├── +layout.svelte            → Layout wrapper for all pages
├── +layout.server.ts         → Server-side layout logic
├── about/
│   └── +page.svelte          → /about
├── blog/
│   ├── +page.svelte          → /blog
│   ├── [slug]/
│   │   └── +page.svelte      → /blog/[dynamic-slug]
│   └── +layout.svelte        → Layout for all /blog/* pages
├── api/
│   └── users/
│       └── +server.ts        → /api/users (API endpoint)
└── example/
    ├── +page.svelte          → /example
    └── +page.server.ts       → Server logic for /example
```

## Special Files

### Page Files
- `+page.svelte` - Creates a page component
- `+page.server.ts` - Server-side logic (load functions, actions)
- `+page.ts` - Client-side page logic

### Layout Files
- `+layout.svelte` - Wraps pages with common UI
- `+layout.server.ts` - Server-side layout logic
- `+layout.ts` - Client-side layout logic

### API Routes
- `+server.ts` - API endpoints (GET, POST, PUT, DELETE handlers)

## Dynamic Routes
- `[slug]/+page.svelte` - Dynamic parameter
- `[...rest]/+page.svelte` - Rest parameters
- `[[optional]]/+page.svelte` - Optional parameters

## Server Actions Example

The `/example` page demonstrates:
1. **Load Function**: Runs on server before page renders
2. **Form Actions**: Handle form submissions server-side
3. **Data Flow**: Server → Page → User interaction → Server

```typescript
// +page.server.ts
export const load = async () => {
  return { data: 'from server' };
};

export const actions = {
  myAction: async ({ request }) => {
    // Handle form submission
    return { success: true };
  }
};
```

```svelte
<!-- +page.svelte -->
<script>
  export let data; // From load function
</script>

<form method="POST" action="?/myAction">
  <button type="submit">Submit</button>
</form>
```

## Visit the Example
Navigate to `/example` to see a working demonstration of server actions and file-based routing.