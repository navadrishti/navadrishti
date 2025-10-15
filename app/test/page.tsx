export default function TestPage() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Navdrishti Test Page</h1>
      <p>If you can see this, the deployment is working!</p>
      <p>Date: {new Date().toISOString()}</p>
    </div>
  );
}