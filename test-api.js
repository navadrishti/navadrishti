// Simple test to check API response
fetch('https://udaan-collective-product-8yvjmtwae-toxicshinchans-projects.vercel.app/api/marketplace')
  .then(response => response.json())
  .then(data => {
    console.log('Marketplace API response:', data);
    
    if (data.success && data.data && data.data.length > 0) {
      const firstProduct = data.data[0];
      console.log('First product ID:', firstProduct.id);
      
      // Test individual product API
      return fetch(`https://udaan-collective-product-8yvjmtwae-toxicshinchans-projects.vercel.app/api/marketplace/product/${firstProduct.id}`);
    } else {
      console.log('No products found in marketplace');
    }
  })
  .then(response => response && response.json())
  .then(data => {
    console.log('Product API response:', data);
  })
  .catch(error => {
    console.error('API test error:', error);
  });