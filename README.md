Welcome to your new TanStack Start app! 

# Getting Started

To run this application:

```bash
pnpm install
```

### Makefile Shortcuts

For POC-friendly recovery and repeatable flows:

```bash
make install
make run-initial
```

Key targets:
- `make db-reset` recreates the local Postgres volume for a clean database state
- `make db-setup` runs schema push + seed on a clean DB
- `make run-initial` executes baseline dry-run in live mode (stage step 1)
- `make run-history-live` replays history in live mode with MCP-enabled flow (stage step 2)
- `make run-stage-live` runs the stage sequence (`run-initial` then `run-history-live`)
- `make run-history` replays history in deterministic mock mode; add `DAY=day-03` to limit the run to a single day
- `make run-demo-history` runs `judgeDemoRunner` as failover (default `HISTORY_MODE=mock`, supports `HISTORY_MODE=live`)
- `make pre-demo-check` runs `db-setup`, then test/lint plus baseline/history/judge demo verification before presentation
- `make diagnose` checks Gemini model reachability and quota-style throttle signals (`429`, `Retry-After`)

## Database Setup

Initialize the SQLite database and seed initial test data:

```bash
pnpm run db:push
pnpm run db:seed
```

## Initial Setup from Test Data

Run the baseline ingestion dry-run against local test data:

```bash
make run-initial
```

Environment variables for AI extraction:
- `GEMINI_API_KEY` (required)
- `GEMINI_MODEL_GATEKEEPER` (optional, defaults to `GEMINI_MODEL` if set)
- `GEMINI_MODEL_EXTRACTOR` (optional, defaults to `GEMINI_MODEL` if set)
- `GEMINI_MAX_RETRIES` (optional, default `5`; retries on 429/503)
- `GEMINI_MIN_REQUEST_DELAY_MS` (optional, default `1000`; minimum delay between Gemini calls per service instance)
- `GEMINI_DEBUG` (optional, set `1` to print retry/attempt diagnostics)

This baseline flow ingests:
- core ERP files from `testfiles/stammdaten` as gold facts
- selected noisy files from `testfiles/emails` and `testfiles/rechnungen` via Gatekeeper + FactExtractor

`testfiles/HistoryPopulationData/day-01` to `day-10` are intentionally separate and used for the history replay/population epic, not baseline ingestion.

## Running the App

```bash
pnpm dev
```

# Building For Production

To build this application for production:

```bash
pnpm build
```

## Testing

This project uses [Vitest](https://vitest.dev/) for testing. 

### Running Tests

Run all tests:
```bash
pnpm test
```

Run the baseline dry-run integration test only:
```bash
pnpm test src/engine/__tests__/baselineDryRun.test.ts
```

Run specific test suites:
- **Unit Tests**: `npx vitest src/engine/ingestors/__tests__/`
- **Integration Tests**: `npx vitest src/engine/__tests__/integration.test.ts`

### Continuous Integration

A GitHub Action is configured in `.github/workflows/tests.yml` to automatically run the test suite on every push or pull request to the `main` branch.

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Uninstall the packages: `pnpm add @tailwindcss/vite tailwindcss --dev`

## Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The following scripts are available:


```bash
pnpm lint
pnpm format
pnpm check
```


## Shadcn

Add components using the latest version of [Shadcn](https://ui.shadcn.com/).

```bash
pnpm dlx shadcn@latest add button
```


## T3Env

- You can use T3Env to add type safety to your environment variables.
- Add Environment variables to the `src/env.mjs` file.
- Use the environment variables in your code.

### Usage

```ts
import { env } from "#/env";

console.log(env.VITE_APP_TITLE);
```





## Setting up Better Auth

1. Generate and set the `BETTER_AUTH_SECRET` environment variable in your `.env.local`:

   ```bash
   pnpm dlx @better-auth/cli secret
   ```

2. Visit the [Better Auth documentation](https://www.better-auth.com) to unlock the full potential of authentication in your app.

### Adding a Database (Optional)

Better Auth can work in stateless mode, but to persist user data, add a database:

```typescript
// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  // ... rest of config
});
```

Then run migrations:

```bash
pnpm dlx @better-auth/cli migrate
```



## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).

# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
