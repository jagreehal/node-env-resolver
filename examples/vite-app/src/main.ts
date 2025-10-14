import { env } from './env';

/**
 * Vite app entry point
 * 
 * This code runs in the browser, so only client environment variables
 * (with VITE_ prefix) are accessible.
 */

// Create app container
const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  // ✅ Accessing client vars works fine
  const apiUrl = env.client.VITE_API_URL || 'https://api.example.com';
  const appName = env.client.VITE_APP_NAME || 'Vite App';
  const analyticsEnabled = env.client.VITE_ENABLE_ANALYTICS;
  const version = env.client.VITE_VERSION || '1.0.0';

  app.innerHTML = `
    <div class="container">
      <h1>${appName}</h1>
      <p>Version: ${version}</p>
      
      <div class="info">
        <h2>Environment Configuration</h2>
        <p><strong>API URL:</strong> ${apiUrl}</p>
        <p><strong>Analytics:</strong> ${analyticsEnabled ? 'Enabled' : 'Disabled'}</p>
      </div>

      <div class="warning">
        <h3>⚠️ Server Variables</h3>
        <p>Try uncommenting the line below to see runtime protection in action:</p>
        <pre><code>// console.log(env.server.DATABASE_URL);</code></pre>
        <p>Accessing server vars in the browser will throw a helpful error!</p>
      </div>

      <div class="demo">
        <h3>Try It:</h3>
        <button id="test-client">Access Client Var ✅</button>
        <button id="test-server">Access Server Var ❌</button>
        <div id="result"></div>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }

    h1 {
      color: #333;
      margin-bottom: 0.5rem;
      font-size: 2.5rem;
    }

    h2 {
      color: #555;
      margin-top: 2rem;
      margin-bottom: 1rem;
      font-size: 1.5rem;
      border-bottom: 2px solid #667eea;
      padding-bottom: 0.5rem;
    }

    h3 {
      color: #666;
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
    }

    .info {
      background: #f8f9fa;
      padding: 1.5rem;
      border-radius: 8px;
      margin-top: 1.5rem;
    }

    .info p {
      margin: 0.5rem 0;
    }

    .warning {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 1.5rem;
      border-radius: 4px;
      margin-top: 2rem;
    }

    .warning pre {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 4px;
      margin: 1rem 0;
      overflow-x: auto;
    }

    .demo {
      margin-top: 2rem;
      padding: 1.5rem;
      background: #e3f2fd;
      border-radius: 8px;
    }

    button {
      background: #667eea;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1rem;
      margin: 0.5rem 0.5rem 0.5rem 0;
      transition: all 0.2s;
    }

    button:hover {
      background: #5568d3;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }

    button:active {
      transform: translateY(0);
    }

    #result {
      margin-top: 1rem;
      padding: 1rem;
      border-radius: 4px;
      font-family: monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #result.success {
      background: #d4edda;
      border: 1px solid #c3e6cb;
      color: #155724;
    }

    #result.error {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      color: #721c24;
    }

    #result:empty {
      display: none;
    }

    strong {
      color: #667eea;
    }
  `;
  document.head.appendChild(style);

  // Add event listeners
  const resultDiv = document.querySelector<HTMLDivElement>('#result');
  
  document.querySelector('#test-client')?.addEventListener('click', () => {
    try {
      const value = env.client.VITE_API_URL || 'Not set';
      if (resultDiv) {
        resultDiv.className = 'success';
        resultDiv.textContent = `✅ Success! VITE_API_URL = "${value}"`;
      }
    } catch (error) {
      if (resultDiv) {
        resultDiv.className = 'error';
        resultDiv.textContent = `❌ Error: ${error}`;
      }
    }
  });

  document.querySelector('#test-server')?.addEventListener('click', () => {
    try {
      // This will throw an error due to runtime protection
      const value = env.server.DATABASE_URL;
      if (resultDiv) {
        resultDiv.className = 'success';
        resultDiv.textContent = `Value: ${value}`;
      }
    } catch (error) {
      if (resultDiv) {
        resultDiv.className = 'error';
        resultDiv.textContent = `❌ ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  });

  console.log('✅ Vite app initialized successfully!');
  console.log('Client env vars:', env.client);
}

