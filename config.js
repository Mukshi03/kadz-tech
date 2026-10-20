/* ==========================================================
   KADZ Tech — site settings
   Edit this file to fill in your details. Empty values are
   hidden on the site automatically.
   ========================================================== */
window.KADZ = {
  company: "KADZ Tech",
  tagline: "",               // e.g. "Warehousing on demand"

  contact: {
    phone: "",               // e.g. "+966 5X XXX XXXX"
    email: "",               // e.g. "hello@kadztech.com"
    address: ""              // e.g. "Jeddah, Saudi Arabia"
  },

  // Cities offered in search filters and the partner form,
  // e.g. ["Jeddah", "Riyadh", "Dammam"]
  cities: ["Jeddah", "Riyadh", "Dammam"],

  currency: "SAR",

  // Default monthly price per pallet used by the estimator on the quote page.
  // Leave as null to show "On request". Each warehouse sets its own price.
  rates: {
    dry: null,
    ambient: null,
    chilled: null,
    frozen: null
  },

  /* ---------- Supabase connection ----------
     Supabase dashboard → Project Settings → API Keys.
     Copy the Project URL and the anon / publishable key.
     The anon key is safe to publish: database rules protect the data. */
  supabaseUrl:"https://gpwxkcajprnroeffknqh.supabase.co",           // e.g. "https://abcdxyz.supabase.co"
  supabaseAnonKey:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwd3hrY2FqcHJucm9lZmZrbnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NjczODIsImV4cCI6MjEwODA0MzM4Mn0.5z1dT1jpdzCnYgv4FvQHtiA67UpmI6_eTF8ADl6KIdg"
};
