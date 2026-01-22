const supabaseConfig = {
    url: "https://tkwjxmhnroqprmjfoaua.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrd2p4bWhucm9xcHJtamZvYXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NzM1MzksImV4cCI6MjA4NDU0OTUzOX0.4kcq7jztHm_zvS1yMX1VjZAvMbxKgNHBqkiThotG3DM" // Make sure this is your actual anon key
};

// Assuming supabase-js is loaded via CDN
const supabaseClient = typeof window !== 'undefined' && window.supabase 
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey) 
    : null;

if (typeof window !== 'undefined') {
    window.supabaseClient = supabaseClient;
}
