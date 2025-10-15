export default function SimplePage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>Navdrishti</h1>
      <p>Welcome to Navdrishti - Your platform for social impact and commerce</p>
      <div style={{ marginTop: '2rem' }}>
        <h2>Quick Links:</h2>
        <ul>
          <li><a href="/login">Login</a></li>
          <li><a href="/register">Register</a></li>
          <li><a href="/marketplace">Marketplace</a></li>
          <li><a href="/test">Test Page</a></li>
        </ul>
      </div>
      <p style={{ marginTop: '2rem', color: '#666' }}>
        Deployment time: {new Date().toISOString()}
      </p>
    </div>
  );
}