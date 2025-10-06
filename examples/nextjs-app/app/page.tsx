import { ClientComponent } from './client-component';
import { env } from '../env';

// Server Component - can access both server and client env with type safety
export default function HomePage() {
  // ✅ Server variables work in server components with full type safety
  const isDev = env.server.NODE_ENV === 'development';
  const port = env.server.PORT;
  const dbUrl = env.server.DATABASE_URL;
  
  // ✅ Client variables also work in server components
  const appUrl = env.client.NEXT_PUBLIC_APP_URL;
  const analyticsEnabled = env.client.NEXT_PUBLIC_ENABLE_ANALYTICS;

  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">
        Node Env Resolver + Next.js
      </h1>
      
      <div className="grid gap-4">
        <div className="p-4 border rounded">
          <h2 className="text-xl font-semibold mb-2">Server Environment (Type-Safe)</h2>
          <p>Environment: <code className="bg-gray-100 px-2 py-1 rounded">{env.server.NODE_ENV}</code></p>
          <p>Port: <code className="bg-gray-100 px-2 py-1 rounded">{port}</code></p>
          <p>Database URL: <code className="bg-gray-100 px-2 py-1 rounded">{dbUrl || 'Not set'}</code></p>
          <p className="text-sm text-gray-600 mt-2">
            ℹ️ All values are type-safe! Port is a number, Database URL is a validated string.
          </p>
        </div>

        <div className="p-4 border rounded">
          <h2 className="text-xl font-semibold mb-2">Client Environment (Available on Server)</h2>
          <p>App URL: <code className="bg-gray-100 px-2 py-1 rounded">{appUrl || 'Not set'}</code></p>
          <p>Analytics: <code className="bg-gray-100 px-2 py-1 rounded">{String(analyticsEnabled)}</code></p>
          <p className="text-sm text-gray-600 mt-2">
            ℹ️ Client variables are available in server components too.
          </p>
        </div>

        <ClientComponent />

        <div className="p-4 border rounded bg-blue-50">
          <h2 className="text-xl font-semibold mb-2">🚀 Automatic Client/Server Split</h2>
          <p className="text-sm text-gray-700 mb-2">
            This example demonstrates true automatic client/server splitting with runtime protection:
          </p>
          <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
            <li><strong>Type Safety:</strong> All environment variables are properly typed</li>
            <li><strong>Runtime Protection:</strong> Server variables throw errors in client components</li>
            <li><strong>Zero Config:</strong> No manual process.env access needed</li>
            <li><strong>Elegant Syntax:</strong> Shorthand syntax like &apos;url?&apos;, &apos;port:3000&apos;</li>
          </ul>
          
          {isDev && (
            <div className="bg-yellow-100 p-3 rounded mt-2">
              <p className="text-sm text-yellow-800">
                🚧 <strong>Development Mode:</strong> Try clicking the button in the client component 
                to see runtime protection in action!
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}