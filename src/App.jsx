import React from 'react';
import './App.css';

// Check if our WASM link is working
function App() {
  return (
    <div className="App">
      <h1>Quoridor Game</h1>
      <p>Checking if WASM is properly linked...</p>
      <pre>
        {JSON.stringify({
          wasmExists: typeof window !== 'undefined' && 
            window.location.protocol !== 'file:' && 
            Boolean(window.WebAssembly)
        }, null, 2)}
      </pre>
      <p>If you see "wasmExists: true", WebAssembly is supported in your browser.</p>
      
      <div>
        <h2>Next Steps:</h2>
        <ol>
          <li>Make sure the WASM module is built: <code>wasm-pack build --target web</code></li>
          <li>Check the symlink: <code>ls -la web-ui/src/wasm</code></li>
          <li>Create the QuoridorGame component in <code>src/components/QuoridorGame.jsx</code></li>
        </ol>
      </div>
    </div>
  );
}

export default App;