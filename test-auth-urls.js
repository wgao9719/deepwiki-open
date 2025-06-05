// Quick test to see what URLs Supabase is generating
// Run this in your browser console when on localhost:3000

console.log('=== AUTH URL TEST ===');
console.log('Current window location:', window.location.href);
console.log('Origin:', window.location.origin);
console.log('Redirect URL that will be used:', `${window.location.origin}/auth/callback`);

// This shows what Supabase should be configured with
console.log('=== SUPABASE CONFIGURATION NEEDED ===');
console.log('Site URL should be:', window.location.origin);
console.log('Additional redirect URLs should include:', `${window.location.origin}/**`);

// Test if we can reach our callback endpoint
fetch('/auth/callback?test=true')
  .then(response => {
    console.log('Callback endpoint accessible:', response.status);
  })
  .catch(error => {
    console.error('Callback endpoint issue:', error);
  }); 