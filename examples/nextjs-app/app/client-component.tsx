'use client';

import { useState } from 'react';
import { env } from '../env';

// Client Component - only client env variables work here with runtime protection
export function ClientComponent() {
  const [serverVarError, setServerVarError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // ✅ Client variables work fine with full type safety
  const appUrl = env.client.NEXT_PUBLIC_APP_URL;
  const analyticsEnabled = env.client.NEXT_PUBLIC_ENABLE_ANALYTICS;
  const gaId = env.client.NEXT_PUBLIC_GA_ID;
  
  const tryAccessServerVar = () => {
    try {
      // ❌ This will throw an error - server vars protected in client
      console.log('Trying to access server variable:', env.server.DATABASE_URL);
      setServerVarError(null);
      setSuccessMessage('No error thrown - this should not happen!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Expected error:', error);
      setServerVarError(errorMessage);
      setSuccessMessage(null);
    }
  };

  const tryAccessClientVar = () => {
    try {
      // ✅ This works fine
      console.log('Accessing client variable:', env.client.NEXT_PUBLIC_APP_URL);
      setSuccessMessage('✅ Successfully accessed client variable! Check console.');
      setServerVarError(null);
    } catch (error) {
      setServerVarError(`Unexpected error: ${error}`);
      setSuccessMessage(null);
    }
  };

  return (
    <div className="p-4 border rounded bg-green-50">
      <h2 className="text-xl font-semibold mb-2">Client Environment (Type-Safe)</h2>
      
      <div className="space-y-2 mb-4">
        <p>App URL: <code className="bg-gray-100 px-2 py-1 rounded">{appUrl || 'Not set'}</code></p>
        <p>Analytics: <code className="bg-gray-100 px-2 py-1 rounded">{String(analyticsEnabled)}</code></p>
        <p>GA ID: <code className="bg-gray-100 px-2 py-1 rounded">{gaId ? gaId : 'Not set'}</code></p>
      </div>
      
      <p className="text-sm text-gray-600 mb-4">
        ℹ️ This runs in the browser with full type safety. App URL is a validated string, Analytics is a boolean.
      </p>
      
      <div className="space-y-2">
        <div className="flex gap-2">
          <button 
            onClick={tryAccessClientVar}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            ✅ Access CLIENT variable
          </button>
          
          <button 
            onClick={tryAccessServerVar}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            🚨 Try SERVER variable (will error)
          </button>
        </div>
        
        {successMessage && (
          <div className="bg-green-100 border border-green-300 p-3 rounded">
            <p className="text-green-800 text-sm">{successMessage}</p>
          </div>
        )}
        
        {serverVarError && (
          <div className="bg-red-100 border border-red-300 p-3 rounded">
            <p className="text-red-800 text-sm font-mono whitespace-pre-wrap">
              {serverVarError}
            </p>
            <p className="text-red-700 text-xs mt-2">
              💡 This is the runtime protection working! Server variables are blocked in client components.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}